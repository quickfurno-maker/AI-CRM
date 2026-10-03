export const CRM_FILTER_OPERATORS = [
  'EQ',
  'NEQ',
  'CONTAINS',
  'STARTS_WITH',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IN',
  'IS_EMPTY',
  'NOT_EMPTY',
] as const;

export type CrmFilterOperator = (typeof CRM_FILTER_OPERATORS)[number];

export type CrmFilterRule = {
  field: string;
  operator: CrmFilterOperator;
  value?: unknown;
};

export type CrmFilterGroup = {
  op: 'AND' | 'OR';
  rules: Array<CrmFilterRule | CrmFilterGroup>;
};

const OPERATORS = new Set<string>(CRM_FILTER_OPERATORS);

export function validateFilterTree(
  value: unknown,
  depth = 0,
): CrmFilterGroup {
  if (depth > 6) throw new Error('Filter nesting is too deep.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Filter must be an object.');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.op !== 'AND' && candidate.op !== 'OR') {
    throw new Error('Filter group op must be AND or OR.');
  }
  if (!Array.isArray(candidate.rules) || candidate.rules.length > 100) {
    throw new Error('Filter group must contain at most 100 rules.');
  }

  return {
    op: candidate.op,
    rules: candidate.rules.map((rule) => {
      if (
        rule &&
        typeof rule === 'object' &&
        !Array.isArray(rule) &&
        ('op' in rule || 'rules' in rule)
      ) {
        return validateFilterTree(rule, depth + 1);
      }
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
        throw new Error('Filter rule must be an object.');
      }
      const record = rule as Record<string, unknown>;
      if (
        typeof record.field !== 'string' ||
        !record.field.trim() ||
        record.field.length > 180
      ) {
        throw new Error('Filter rule field is invalid.');
      }
      if (
        typeof record.operator !== 'string' ||
        !OPERATORS.has(record.operator)
      ) {
        throw new Error('Filter rule operator is invalid.');
      }
      return {
        field: record.field,
        operator: record.operator as CrmFilterOperator,
        value: record.value,
      };
    }),
  };
}

export function filterFields(tree: CrmFilterGroup): string[] {
  const fields: string[] = [];
  for (const rule of tree.rules) {
    if ('op' in rule) fields.push(...filterFields(rule));
    else fields.push(rule.field);
  }
  return [...new Set(fields)];
}

export function evaluateFilterTree(
  tree: CrmFilterGroup,
  row: Record<string, unknown>,
  customValues: Record<string, unknown> = {},
): boolean {
  const results = tree.rules.map((rule) => {
    if ('op' in rule) return evaluateFilterTree(rule, row, customValues);
    const actual = rule.field.startsWith('custom.')
      ? customValues[rule.field.slice('custom.'.length)]
      : row[rule.field];
    return compare(actual, rule.operator, rule.value);
  });
  return tree.op === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean);
}

export function compare(
  actual: unknown,
  operator: CrmFilterOperator,
  expected?: unknown,
): boolean {
  const empty =
    actual === undefined ||
    actual === null ||
    actual === '' ||
    (Array.isArray(actual) && actual.length === 0);

  if (operator === 'IS_EMPTY') return empty;
  if (operator === 'NOT_EMPTY') return !empty;

  if (operator === 'IN') {
    if (!Array.isArray(expected)) return false;
    return expected.some((item) => scalarEqual(actual, item));
  }

  if (operator === 'CONTAINS') {
    if (Array.isArray(actual)) {
      return actual.some((item) => scalarEqual(item, expected));
    }
    return String(actual ?? '')
      .toLocaleLowerCase()
      .includes(String(expected ?? '').toLocaleLowerCase());
  }

  if (operator === 'STARTS_WITH') {
    return String(actual ?? '')
      .toLocaleLowerCase()
      .startsWith(String(expected ?? '').toLocaleLowerCase());
  }

  if (operator === 'EQ') return scalarEqual(actual, expected);
  if (operator === 'NEQ') return !scalarEqual(actual, expected);

  const actualNumber = comparableNumber(actual);
  const expectedNumber = comparableNumber(expected);
  if (actualNumber === undefined || expectedNumber === undefined) return false;

  if (operator === 'GT') return actualNumber > expectedNumber;
  if (operator === 'GTE') return actualNumber >= expectedNumber;
  if (operator === 'LT') return actualNumber < expectedNumber;
  return actualNumber <= expectedNumber;
}

function scalarEqual(left: unknown, right: unknown) {
  if (typeof left === 'string' || typeof right === 'string') {
    return String(left ?? '').toLocaleLowerCase() ===
      String(right ?? '').toLocaleLowerCase();
  }
  return left === right;
}

function comparableNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  if (value instanceof Date) return value.getTime();
  return undefined;
}
