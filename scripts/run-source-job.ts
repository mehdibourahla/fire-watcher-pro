import { executeNextSourceJob } from "../src/lib/ingest/source-executor.server";
import { sourceJobCommandExitCode } from "../src/lib/source-job-command";

const valueAfter = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
};

const target = valueAfter("--target");
const contract = valueAfter("--contract");

if (target !== "github") {
  console.error("--target must be github");
  process.exit(1);
}
if (contract !== "local_fwi" && contract !== "effis") {
  console.error("--contract must be local_fwi or effis");
  process.exit(1);
}

const result = await executeNextSourceJob({
  target,
  contractKey: contract,
  workerId: `github:${process.env["GITHUB_RUN_ID"] ?? "local"}:${contract}`,
});
console.log(JSON.stringify(result));
process.exitCode = sourceJobCommandExitCode(result);
