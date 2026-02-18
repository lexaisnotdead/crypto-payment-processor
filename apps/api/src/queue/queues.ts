import { Queue } from "bullmq";
import type { SweepJob } from "../../../../packages/shared/src/types.js";

const connection = {
    host: process.env.REDIS_HOST ?? "redis",
    port: Number(process.env.REDIS_PORT ?? 6379),
};

export const sweepQueue = new Queue<SweepJob>("sweep", { connection });

export const buildSweepJobId = (job: Pick<SweepJob, "chainId" | "txHash" | "logIndex">): string =>
    `${job.chainId}:${job.txHash}:${job.logIndex}`;
