import type { Pool } from 'pg';

export type CrmDataJob = {
  id: string;
  organization_id: string;
  workspace_id: string;
  requested_by_member_id: string;
  direction: 'IMPORT' | 'EXPORT';
  object_type: 'CONTACT' | 'COMPANY' | 'LEAD' | 'DEAL';
  duplicate_strategy: 'SKIP' | 'UPDATE' | 'CREATE';
  mapping: Record<string, string> | null;
  columns: string[] | null;
  filter: {
    requested?: Record<string, unknown>;
    scopeSnapshot?: {
      scope?: string;
      ownerMemberIds?: string[];
      workspaceId?: string;
      branchId?: string;
    };
  } | null;
  total_rows: number;
  processed_rows: number;
  succeeded_rows: number;
  failed_rows: number;
  attempts: number;
};

type JobRow = {
  id: string;
  row_number: number;
  input: Record<string, unknown>;
};

const EXPORT_FIELDS: Record<string, string[]> = {
  CONTACT: [
    'id',
    'workspace_id',
    'owner_member_id',
    'display_name',
    'first_name',
    'last_name',
    'email',
    'phone',
    'source',
    'lifecycle_stage',
    'status',
    'created_at',
    'updated_at',
  ],
  COMPANY: [
    'id',
    'workspace_id',
    'owner_member_id',
    'name',
    'domain',
    'website',
    'phone',
    'industry',
    'status',
    'created_at',
    'updated_at',
  ],
  LEAD: [
    'id',
    'workspace_id',
    'contact_id',
    'company_id',
    'owner_member_id',
    'title',
    'source',
    'status',
    'temperature',
    'score',
    'estimated_value',
    'currency',
    'expected_close_date',
    'created_at',
    'updated_at',
  ],
  DEAL: [
    'id',
    'workspace_id',
    'contact_id',
    'company_id',
    'lead_id',
    'owner_member_id',
    'name',
    'amount',
    'currency',
    'status',
    'probability',
    'expected_close_date',
    'closed_at',
    'created_at',
    'updated_at',
  ],
};

const TABLES: Record<string, string> = {
  CONTACT: 'crm_contacts',
  COMPANY: 'crm_companies',
  LEAD: 'crm_leads',
  DEAL: 'crm_deals',
};

export async function resetStaleCrmDataJobs(pool: Pool) {
  await pool.query(`
    update crm_data_jobs
    set status = 'PENDING',
        error = coalesce(error, 'Worker claim expired and was safely resumed.'),
        updated_at = now()
    where status = 'PROCESSING'
      and updated_at < now() - interval '5 minutes'
  `);
}

export async function claimCrmDataJob(
  pool: Pool,
): Promise<CrmDataJob | undefined> {
  const result = await pool.query<CrmDataJob>(`
    with picked as (
      select id
      from crm_data_jobs
      where status = 'PENDING'
      order by created_at
      limit 1
      for update skip locked
    )
    update crm_data_jobs job
    set status = 'PROCESSING',
        attempts = job.attempts + 1,
        started_at = coalesce(job.started_at, now()),
        error = null,
        updated_at = now()
    from picked
    where job.id = picked.id
    returning job.*
  `);
  return result.rows[0];
}

export async function processCrmDataJob(pool: Pool, job: CrmDataJob) {
  try {
    if (job.direction === 'IMPORT') {
      await processImport(pool, job);
    } else {
      await processExport(pool, job);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `update crm_data_jobs
       set status = case when attempts >= 5 then 'FAILED' else 'PENDING' end,
           error = left($2, 4000),
           updated_at = now(),
           completed_at = case when attempts >= 5 then now() else completed_at end
       where id = $1`,
      [job.id, message],
    );
    throw error;
  }
}

async function processImport(pool: Pool, job: CrmDataJob) {
  while (true) {
    const pending = await pool.query<JobRow>(
      `select id, row_number, input
       from crm_data_job_rows
       where job_id = $1 and status = 'PENDING'
       order by row_number
       limit 100`,
      [job.id],
    );
    if (!pending.rows.length) break;

    for (const row of pending.rows) {
      try {
        const mapped = mapInput(row.input, job.mapping);
        const result =
          job.object_type === 'CONTACT'
            ? await importContact(pool, job, mapped)
            : job.object_type === 'COMPANY'
              ? await importCompany(pool, job, mapped)
              : job.object_type === 'LEAD'
                ? await importLead(pool, job, mapped)
                : (() => {
                    throw new Error('Deal import is not enabled.');
                  })();

        await pool.query(
          `update crm_data_job_rows
           set status = $2,
               object_id = $3,
               error = null,
               processed_at = now()
           where id = $1`,
          [row.id, result.status, result.objectId],
        );
        await pool.query(
          `update crm_data_jobs
           set processed_rows = processed_rows + 1,
               succeeded_rows = succeeded_rows + $2,
               updated_at = now()
           where id = $1`,
          [job.id, result.status === 'SUCCEEDED' ? 1 : 0],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await pool.query(
          `update crm_data_job_rows
           set status = 'FAILED',
               error = left($2, 4000),
               processed_at = now()
           where id = $1`,
          [row.id, message],
        );
        await pool.query(
          `update crm_data_jobs
           set processed_rows = processed_rows + 1,
               failed_rows = failed_rows + 1,
               updated_at = now()
           where id = $1`,
          [job.id],
        );
      }
    }
  }

  const counts = await pool.query<{
    total_rows: number;
    processed_rows: number;
    failed_rows: number;
  }>(
    `select total_rows, processed_rows, failed_rows
     from crm_data_jobs where id = $1`,
    [job.id],
  );
  const state = counts.rows[0];
  if (!state) throw new Error('CRM data job disappeared during processing.');

  if (state.processed_rows >= state.total_rows) {
    const status = state.failed_rows > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    await completeJob(pool, job, status);
  } else {
    await pool.query(
      `update crm_data_jobs set status = 'PENDING', updated_at = now() where id = $1`,
      [job.id],
    );
  }
}

async function importContact(
  pool: Pool,
  job: CrmDataJob,
  row: Record<string, unknown>,
) {
  const displayName =
    textValue(row.displayName) ??
    ([textValue(row.firstName), textValue(row.lastName)]
      .filter(Boolean)
      .join(' ')
      .trim() ||
      textValue(row.email) ||
      textValue(row.phone));
  if (!displayName) throw new Error('Contact displayName is required.');

  const email = normalizedEmail(row.email);
  const phone = textValue(row.phone);
  const existing = await findContact(pool, job.organization_id, email, phone);

  if (existing && job.duplicate_strategy === 'SKIP') {
    return { status: 'SKIPPED', objectId: existing };
  }
  if (existing && job.duplicate_strategy === 'UPDATE') {
    await pool.query(
      `update crm_contacts
       set display_name = $3,
           first_name = coalesce($4, first_name),
           last_name = coalesce($5, last_name),
           email = coalesce($6, email),
           phone = coalesce($7, phone),
           source = coalesce($8, source),
           updated_at = now()
       where organization_id = $1 and id = $2`,
      [
        job.organization_id,
        existing,
        displayName,
        textValue(row.firstName),
        textValue(row.lastName),
        email,
        phone,
        textValue(row.source),
      ],
    );
    return { status: 'SUCCEEDED', objectId: existing };
  }

  const inserted = await pool.query<{ id: string }>(
    `insert into crm_contacts (
       organization_id, workspace_id, owner_member_id, display_name,
       first_name, last_name, email, phone, source
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      job.organization_id,
      job.workspace_id,
      job.requested_by_member_id,
      displayName,
      textValue(row.firstName),
      textValue(row.lastName),
      email,
      phone,
      textValue(row.source),
    ],
  );
  return { status: 'SUCCEEDED', objectId: inserted.rows[0]!.id };
}

async function findContact(
  pool: Pool,
  organizationId: string,
  email?: string,
  phone?: string,
) {
  if (email) {
    const rows = await pool.query<{ id: string }>(
      `select id from crm_contacts
       where organization_id = $1 and lower(email) = lower($2)
       limit 1`,
      [organizationId, email],
    );
    if (rows.rows[0]) return rows.rows[0].id;
  }
  if (phone) {
    const rows = await pool.query<{ id: string }>(
      `select id from crm_contacts
       where organization_id = $1 and phone = $2
       limit 1`,
      [organizationId, phone],
    );
    return rows.rows[0]?.id;
  }
  return undefined;
}

async function importCompany(
  pool: Pool,
  job: CrmDataJob,
  row: Record<string, unknown>,
) {
  const name = textValue(row.name);
  if (!name) throw new Error('Company name is required.');
  const domain = textValue(row.domain)?.toLocaleLowerCase();

  const existingRows = domain
    ? await pool.query<{ id: string }>(
        `select id from crm_companies
         where organization_id = $1 and lower(domain) = lower($2)
         limit 1`,
        [job.organization_id, domain],
      )
    : await pool.query<{ id: string }>(
        `select id from crm_companies
         where organization_id = $1 and lower(name) = lower($2)
         limit 1`,
        [job.organization_id, name],
      );
  const existing = existingRows.rows[0]?.id;

  if (existing && job.duplicate_strategy === 'SKIP') {
    return { status: 'SKIPPED', objectId: existing };
  }
  if (existing && job.duplicate_strategy === 'UPDATE') {
    await pool.query(
      `update crm_companies
       set name = $3,
           domain = coalesce($4, domain),
           website = coalesce($5, website),
           phone = coalesce($6, phone),
           industry = coalesce($7, industry),
           updated_at = now()
       where organization_id = $1 and id = $2`,
      [
        job.organization_id,
        existing,
        name,
        domain,
        textValue(row.website),
        textValue(row.phone),
        textValue(row.industry),
      ],
    );
    return { status: 'SUCCEEDED', objectId: existing };
  }

  const inserted = await pool.query<{ id: string }>(
    `insert into crm_companies (
       organization_id, workspace_id, owner_member_id, name,
       domain, website, phone, industry
     ) values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id`,
    [
      job.organization_id,
      job.workspace_id,
      job.requested_by_member_id,
      name,
      domain,
      textValue(row.website),
      textValue(row.phone),
      textValue(row.industry),
    ],
  );
  return { status: 'SUCCEEDED', objectId: inserted.rows[0]!.id };
}

async function importLead(
  pool: Pool,
  job: CrmDataJob,
  row: Record<string, unknown>,
) {
  const title = textValue(row.title);
  if (!title) throw new Error('Lead title is required.');

  const contactId = uuidValue(row.contactId);
  const companyId = uuidValue(row.companyId);
  if (contactId) await assertObject(pool, 'crm_contacts', job.organization_id, contactId);
  if (companyId) await assertObject(pool, 'crm_companies', job.organization_id, companyId);

  const existingRows = await pool.query<{ id: string }>(
    `select id from crm_leads
     where organization_id = $1
       and workspace_id = $2
       and owner_member_id = $3
       and lower(title) = lower($4)
     order by created_at desc
     limit 1`,
    [job.organization_id, job.workspace_id, job.requested_by_member_id, title],
  );
  const existing = existingRows.rows[0]?.id;
  if (existing && job.duplicate_strategy === 'SKIP') {
    return { status: 'SKIPPED', objectId: existing };
  }

  if (existing && job.duplicate_strategy === 'UPDATE') {
    await pool.query(
      `update crm_leads
       set contact_id = coalesce($3, contact_id),
           company_id = coalesce($4, company_id),
           source = coalesce($5, source),
           temperature = coalesce($6, temperature),
           estimated_value = coalesce($7::numeric, estimated_value),
           expected_close_date = coalesce($8::date, expected_close_date),
           updated_at = now()
       where organization_id = $1 and id = $2`,
      [
        job.organization_id,
        existing,
        contactId,
        companyId,
        textValue(row.source),
        enumValue(row.temperature, ['COLD', 'WARM', 'HOT', 'LOST']),
        numericText(row.estimatedValue),
        dateValue(row.expectedCloseDate),
      ],
    );
    return { status: 'SUCCEEDED', objectId: existing };
  }

  const pipeline = await pool.query<{ pipeline_id: string; stage_id: string }>(
    `select pipeline.id as pipeline_id, stage.id as stage_id
     from crm_pipelines pipeline
     join crm_pipeline_stages stage on stage.pipeline_id = pipeline.id
     where pipeline.organization_id = $1
       and pipeline.workspace_id = $2
       and pipeline.object_type = 'LEAD'
       and pipeline.is_default = true
     order by stage.position
     limit 1`,
    [job.organization_id, job.workspace_id],
  );
  if (!pipeline.rows[0]) throw new Error('Default lead pipeline is missing.');

  const inserted = await pool.query<{ id: string }>(
    `insert into crm_leads (
       organization_id, workspace_id, contact_id, company_id, owner_member_id,
       pipeline_id, stage_id, title, source, temperature, estimated_value,
       currency, expected_close_date
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::numeric,$12,$13::date)
     returning id`,
    [
      job.organization_id,
      job.workspace_id,
      contactId,
      companyId,
      job.requested_by_member_id,
      pipeline.rows[0].pipeline_id,
      pipeline.rows[0].stage_id,
      title,
      textValue(row.source),
      enumValue(row.temperature, ['COLD', 'WARM', 'HOT', 'LOST']) ?? 'COLD',
      numericText(row.estimatedValue),
      enumValue(row.currency, ['INR', 'USD', 'EUR', 'GBP', 'AED']) ?? 'INR',
      dateValue(row.expectedCloseDate),
    ],
  );
  return { status: 'SUCCEEDED', objectId: inserted.rows[0]!.id };
}

async function processExport(pool: Pool, job: CrmDataJob) {
  const table = TABLES[job.object_type];
  const allowedFields = EXPORT_FIELDS[job.object_type];
  if (!table || !allowedFields) throw new Error('Unsupported export object type.');

  const requestedColumns = (job.columns?.length ? job.columns : allowedFields)
    .filter((column) => allowedFields.includes(column));
  if (!requestedColumns.length) throw new Error('No valid export columns selected.');

  const scope = job.filter?.scopeSnapshot;
  const ownerIds =
    scope?.scope === 'OWN' ||
    scope?.scope === 'TEAM' ||
    scope?.scope === 'BRANCH'
      ? scope.ownerMemberIds ?? []
      : undefined;
  if (ownerIds && !ownerIds.length) {
    await completeEmptyExport(pool, job);
    return;
  }

  const ownerClause = ownerIds
    ? ' and owner_member_id = any($3::uuid[])'
    : '';
  const parameters: unknown[] = [job.organization_id, job.workspace_id];
  if (ownerIds) parameters.push(ownerIds);

  const rows = await pool.query<Record<string, unknown>>(
    `select *
     from ${table}
     where organization_id = $1
       and workspace_id = $2
       ${ownerClause}
     order by created_at desc
     limit 10000`,
    parameters,
  );

  const filter = normalizeFilter(job.filter?.requested);
  const filtered = filter
    ? rows.rows.filter((row) => evaluateExportFilter(filter, row))
    : rows.rows;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from crm_data_job_rows where job_id = $1', [
      job.id,
    ]);
    for (let start = 0; start < filtered.length; start += 250) {
      const chunk = filtered.slice(start, start + 250);
      const values: unknown[] = [];
      const tuples = chunk.map((row, offset) => {
        const projected = Object.fromEntries(
          requestedColumns.map((column) => [column, jsonSafe(row[column])]),
        );
        values.push(
          job.organization_id,
          job.id,
          start + offset + 1,
          JSON.stringify(projected),
        );
        const base = offset * 4;
        return `($${base + 1}::uuid,$${base + 2}::uuid,$${base + 3},'SUCCEEDED',$${base + 4}::jsonb,now())`;
      });
      await client.query(
        `insert into crm_data_job_rows
          (organization_id, job_id, row_number, status, input, processed_at)
         values ${tuples.join(',')}`,
        values,
      );
    }

    await client.query(
      `update crm_data_jobs
       set status = 'COMPLETED',
           total_rows = $2,
           processed_rows = $2,
           succeeded_rows = $2,
           failed_rows = 0,
           completed_at = now(),
           updated_at = now(),
           error = $3
       where id = $1`,
      [
        job.id,
        filtered.length,
        rows.rows.length === 10000
          ? 'Export reached the internal 10,000-row buffer. Object-storage streaming activation is required for larger exports.'
          : null,
      ],
    );
    await insertCompletionEvent(client, job, 'COMPLETED');
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function completeEmptyExport(pool: Pool, job: CrmDataJob) {
  await pool.query(
    `update crm_data_jobs
     set status = 'COMPLETED',
         total_rows = 0,
         processed_rows = 0,
         succeeded_rows = 0,
         failed_rows = 0,
         completed_at = now(),
         updated_at = now()
     where id = $1`,
    [job.id],
  );
  await pool.query(
    `insert into outbox_events (
       organization_id, event_type, aggregate_type, aggregate_id, payload
     ) values ($1, 'crm.data_job.completed.v1', 'crm_data_job', $2, $3::jsonb)`,
    [
      job.organization_id,
      job.id,
      JSON.stringify({ jobId: job.id, direction: job.direction, status: 'COMPLETED' }),
    ],
  );
}

async function completeJob(
  pool: Pool,
  job: CrmDataJob,
  status: 'COMPLETED' | 'COMPLETED_WITH_ERRORS',
) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update crm_data_jobs
       set status = $2, completed_at = now(), updated_at = now()
       where id = $1`,
      [job.id, status],
    );
    await insertCompletionEvent(client, job, status);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function insertCompletionEvent(
  client: { query: Pool['query'] },
  job: CrmDataJob,
  status: string,
) {
  await client.query(
    `insert into outbox_events (
       organization_id, event_type, aggregate_type, aggregate_id, payload
     ) values ($1, 'crm.data_job.completed.v1', 'crm_data_job', $2, $3::jsonb)`,
    [
      job.organization_id,
      job.id,
      JSON.stringify({
        jobId: job.id,
        direction: job.direction,
        objectType: job.object_type,
        status,
      }),
    ],
  );
}

function mapInput(
  input: Record<string, unknown>,
  mapping: Record<string, string> | null,
) {
  if (!mapping || !Object.keys(mapping).length) return input;
  const mapped: Record<string, unknown> = {};
  for (const [source, target] of Object.entries(mapping)) {
    if (source in input && target) mapped[target] = input[source];
  }
  return mapped;
}

function textValue(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizedEmail(value: unknown) {
  return textValue(value)?.toLocaleLowerCase();
}

function numericText(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('Numeric value is invalid.');
  }
  return String(numeric);
}

function dateValue(value: unknown) {
  const text = textValue(value);
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error('Date must use YYYY-MM-DD.');
  }
  return text;
}

function enumValue(value: unknown, allowed: string[]) {
  const text = textValue(value)?.toUpperCase();
  if (!text) return undefined;
  if (!allowed.includes(text)) throw new Error(`Unsupported value: ${text}.`);
  return text;
}

function uuidValue(value: unknown) {
  const text = textValue(value);
  if (!text) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error('Referenced CRM ID is not a valid UUID.');
  }
  return text;
}

async function assertObject(
  pool: Pool,
  table: 'crm_contacts' | 'crm_companies',
  organizationId: string,
  id: string,
) {
  const rows = await pool.query<{ id: string }>(
    `select id from ${table} where organization_id = $1 and id = $2 limit 1`,
    [organizationId, id],
  );
  if (!rows.rows[0]) throw new Error('Referenced CRM object was not found.');
}

type ExportFilter = {
  op: 'AND' | 'OR';
  rules: Array<
    | ExportFilter
    | { field: string; operator: string; value?: unknown }
  >;
};

function normalizeFilter(value: unknown): ExportFilter | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if ((record.op !== 'AND' && record.op !== 'OR') || !Array.isArray(record.rules)) {
    return undefined;
  }
  return record as unknown as ExportFilter;
}

function evaluateExportFilter(filter: ExportFilter, row: Record<string, unknown>): boolean {
  const results = filter.rules.map((rule) => {
    if ('op' in rule) return evaluateExportFilter(rule, row);
    const actual = row[toSnake(rule.field)];
    const expected = rule.value;
    if (rule.operator === 'IS_EMPTY') return actual === null || actual === undefined || actual === '';
    if (rule.operator === 'NOT_EMPTY') return actual !== null && actual !== undefined && actual !== '';
    if (rule.operator === 'CONTAINS') {
      return String(actual ?? '').toLocaleLowerCase().includes(String(expected ?? '').toLocaleLowerCase());
    }
    if (rule.operator === 'STARTS_WITH') {
      return String(actual ?? '').toLocaleLowerCase().startsWith(String(expected ?? '').toLocaleLowerCase());
    }
    if (rule.operator === 'IN') {
      return Array.isArray(expected) && expected.map(String).includes(String(actual));
    }
    if (rule.operator === 'EQ') return String(actual ?? '').toLocaleLowerCase() === String(expected ?? '').toLocaleLowerCase();
    if (rule.operator === 'NEQ') return String(actual ?? '').toLocaleLowerCase() !== String(expected ?? '').toLocaleLowerCase();
    const left = Number(actual);
    const right = Number(expected);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (rule.operator === 'GT') return left > right;
    if (rule.operator === 'GTE') return left >= right;
    if (rule.operator === 'LT') return left < right;
    if (rule.operator === 'LTE') return left <= right;
    return false;
  });
  return filter.op === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

function toSnake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLocaleLowerCase()}`);
}

function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}
