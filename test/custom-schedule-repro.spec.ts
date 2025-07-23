import { setTimeout } from 'node:timers/promises'
import { Queue, Worker, RepeatOptions, Job } from 'bullmq';
import * as cron from 'cron-parser';
import { RRuleSet } from 'rrule-rust';

const customRepeatStrategy = (
    millis: number,
    opts: RepeatOptions & { pattern?: string, immediately?: boolean, startDate?: string },
    _jobName: string | undefined
) => {
    if (!opts.pattern) {
        return undefined;
    }
    if (opts.immediately) {
        return millis;
    }
    if (
        /((?<![\d\-*])((\*\/)?([0-5]?[0-9])(([,\-\/])([0-5]?[0-9]))*|\*)[^\S\r\n]+((\*\/)?(2[0-3]|1[0-9]|0?[0-9]|00)(([,\-\/])(2[0-3]|1[0-9]|0?[0-9]|00))*|\*)[^\S\r\n]+((\*\/)?([1-9]|[12][0-9]|3[01])(([,\-\/])([1-9]|[12][0-9]|3[01]))*|\*)[^\S\r\n]+((\*\/)?([1-9]|1[0-2])(([,\-\/])([1-9]|1[0-2]))*|\*|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC))[^\S\r\n]+((\*\/)?[0-6](([,\-\/])[0-6])*|\*|00|(sun|mon|tue|wed|thu|fri|sat)|(SUN|MON|TUE|WED|THU|FRI|SAT))[^\S\r\n]*(?:\bexpr \x60date \+\\%W\x60 \\% \d{1,2} > \/dev\/null \|\|)?(?=$| |'|"))|@(annually|yearly|monthly|weekly|daily|hourly|reboot)/.test(
            opts.pattern,
        )
    ) {
        const interval = cron.parseExpression(opts.pattern!, {
            startDate: opts.startDate,
            tz: 'UTC',
        });
        return interval.next().getTime();
    }
    const currentDate =
        opts.startDate && new Date(opts.startDate) > new Date(millis)
            ? new Date(opts.startDate)
            : new Date(millis);

    const rrule = RRuleSet.parse(opts.pattern!);

    // You'd implement getNextOccurrence; here's a fake one for demonstration:
    function getNextOccurrence(current: Date, rrule: any): Date {
        // This should use rrule.after(current) or equivalent in your real logic
        return new Date(current.getTime() + 60_000); // e.g., 1 minute later
    }

    const nextOccurrence = getNextOccurrence(currentDate, rrule);
    return nextOccurrence.getTime();
};

describe('Custom BullMQ Repeat Strategy', () => {
    let queue: Queue;
    let worker: Worker;

    beforeAll(() => {
        queue = new Queue('test-queue', {
            connection: { host: 'localhost', port: 6379 },
            // Inject the custom repeatStrategy here (depends on your app's wiring)
            // For BullMQ >= 4.10.0, you can pass custom repeatStrategy on repeat opts
        });
    });

    afterAll(async () => {
        await queue.close();
        if (worker) await worker.close();
    });


    it('should return millis if immediately is true', () => {
        const now = Date.now();

        const next = customRepeatStrategy(now, {
            pattern:
                'DTSTART;TZID=UTC:20250722T000000Z\nRRULE:FREQ=DAILY;INTERVAL=1;BYHOUR=13;BYMINUTE=42;WKST=MO',
            immediately: true,
            startDate: undefined,
        }, 'test-job');
        expect(next).toBe(now);
    });

    it('should process the job immediately when immediately is true', async () => {
        // Arrange
        const jobName = 'immediate-job';
        let processedAt: number | null = null;

        // Set up a Worker that simply records when it processed a job
        worker = new Worker(
            'test-queue',
            async (job: Job) => {
                processedAt = Date.now();
            },
            {
                connection: { host: 'localhost', port: 6379 }
            }
        );

        // Wait for worker to be ready
        await worker.waitUntilReady();

        // The test start time
        const before = Date.now();

        // Act: Add a repeatable job with immediately: true and pattern
        await queue.add(
            jobName,
            { foo: 'bar' },
            {
                repeat: {
                    pattern:
                        'DTSTART;TZID=UTC:20250722T000000Z\nRRULE:FREQ=DAILY;INTERVAL=1;BYHOUR=13;BYMINUTE=42;WKST=MO',
                    immediately: true,
                    repeatStrategy: customRepeatStrategy,
                } as any, // TS workaround if your types don't match, or adjust accordingly
                removeOnComplete: true,
                removeOnFail: true,
            }
        );

        // Wait until job is processed (with a timeout, so the test doesn't hang)
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Job did not process in time'));
            }, 4000);
            worker.on('completed', () => {
                clearTimeout(timeout);
                resolve();
            });
        });

        // Assert: processedAt should be "immediately" after before
        expect(processedAt).not.toBeNull();
        // Give it a reasonable "immediate" window, e.g. under 2 seconds
        expect(processedAt! - before).toBeLessThan(2000);
    });

});
