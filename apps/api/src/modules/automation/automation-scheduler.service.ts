import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../platform/database/database.service.js';
import { AutomationRuntimeService } from './automation-runtime.service.js';

@Injectable()
export class AutomationSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AutomationSchedulerService.name);
  private running = false;
  private loopPromise?: Promise<void>;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly runtime: AutomationRuntimeService,
  ) {}

  onApplicationBootstrap() {
    const enabled =
      this.config.get<boolean>('AUTOMATION_SCHEDULER_ENABLED') ?? false;
    if (!enabled) return;
    this.running = true;
    this.loopPromise = this.loop();
  }

  async onApplicationShutdown() {
    this.running = false;
    try {
      await this.loopPromise;
    } catch {
      // Shutdown is already underway.
    }
  }

  private pollMs() {
    return (
      this.config.get<number>('AUTOMATION_SCHEDULER_POLL_MS') ?? 1000
    );
  }

  private async loop() {
    while (this.running) {
      try {
        await this.expireApprovals();
        await this.markStaleRuns();
        const runIds = await this.claimDueRuns();
        for (const runId of runIds) {
          try {
            await this.runtime.resumeWaitingRun(runId);
          } catch (error) {
            this.logger.error(
              'Failed to resume automation run ' + runId + '.',
              error instanceof Error ? error.stack : String(error),
            );
          }
        }
      } catch (error) {
        this.logger.error(
          'Automation scheduler iteration failed.',
          error instanceof Error ? error.stack : String(error),
        );
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollMs()));
    }
  }

  private async claimDueRuns() {
    const result = await this.database.pool.query<{ id: string }>(
      `with picked as (
         select id
         from automation_runs
         where status = 'WAITING'
           and wake_at is not null
           and wake_at <= now()
         order by wake_at
         limit 25
         for update skip locked
       )
       update automation_runs as run
       set status = 'RUNNING',
           wake_at = null,
           updated_at = now()
       from picked
       where run.id = picked.id
       returning run.id`,
    );
    return result.rows.map((row) => row.id);
  }

  private async expireApprovals() {
    const client = await this.database.pool.connect();
    try {
      await client.query('begin');
      const expired = await client.query<{ id: string; run_id: string }>(
        `update automation_approvals
         set status = 'EXPIRED',
             decided_at = now()
         where status = 'PENDING'
           and expires_at is not null
           and expires_at <= now()
         returning id, run_id`,
      );

      if (expired.rows.length) {
        const runIds = [
          ...new Set(expired.rows.map((row) => row.run_id)),
        ];
        await client.query(
          `update automation_runs
           set status = 'ACTION_REQUIRED',
               last_error = 'Automation approval expired before a decision.',
               updated_at = now()
           where id = any($1::uuid[])
             and status = 'WAITING_APPROVAL'`,
          [runIds],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async markStaleRuns() {
    await this.database.pool.query(
      `update automation_runs
       set status = 'ACTION_REQUIRED',
           last_error = coalesce(
             last_error,
             'Automation run was left RUNNING for more than five minutes and requires reconciliation.'
           ),
           updated_at = now()
       where status = 'RUNNING'
         and updated_at < now() - interval '5 minutes'`,
    );
  }
}
