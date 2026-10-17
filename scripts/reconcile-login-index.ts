/**
 * Reconcile the login index with every academy's accounts
 *
 * `user_phone_index` is a copy of each academy's active accounts; login reads
 * only the copy. Every write now goes through syncLoginIndex in the same
 * transaction as the account change (src/services/login-index.ts), so the two
 * should never disagree. This checks that they do not, and can rebuild the copy
 * from the accounts when they do (after a manual database edit, a restore, or a
 * bug).
 *
 *   npm run reconcile:login-index            # report only, changes nothing
 *   npm run reconcile:login-index -- --repair
 *
 * Reports user ids and counts, never phone numbers. Exits 1 if any academy
 * disagreed and was not repaired, so it can run as a check.
 */

import { platformPrisma } from '../src/lib/db/platform-client';
import { withTenantContext } from '../src/lib/db/tenant-client';
import { reconcileLoginIndex } from '../src/services/login-index';

async function main() {
  const repair = process.argv.includes('--repair');

  // Suspended academies keep their accounts and logins (login refuses them on
  // status); deleted ones have neither.
  const tenants = await platformPrisma.tenant.findMany({
    where: { status: { in: ['ACTIVE', 'SUSPENDED'] } },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `Login index — ${repair ? 'REPAIR' : 'report only'} — ${tenants.length} academ${tenants.length === 1 ? 'y' : 'ies'}\n`
  );

  let unresolved = 0;
  for (const tenant of tenants) {
    try {
      const report = await withTenantContext(tenant.id, (tx) =>
        reconcileLoginIndex(tx, tenant.id, { repair })
      );
      const problems = report.missing.length + report.stale.length + report.outdated.length;
      if (problems === 0) {
        console.log(`  ✓ ${tenant.name}`);
        continue;
      }
      if (!report.repaired) unresolved++;
      console.log(
        `  ${report.repaired ? '✓ repaired' : '✗'} ${tenant.name}: ` +
          `${report.missing.length} missing, ${report.stale.length} stale, ${report.outdated.length} outdated`
      );
      for (const [kind, ids] of Object.entries({
        missing: report.missing,
        stale: report.stale,
        outdated: report.outdated,
      })) {
        if (ids.length > 0) console.log(`      ${kind}: ${ids.join(', ')}`);
      }
    } catch (err) {
      unresolved++;
      console.log(`  ✗ ${tenant.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (unresolved > 0) {
    console.log(
      `\n${unresolved} academ${unresolved === 1 ? 'y' : 'ies'} need attention.` +
        (repair ? '' : ' Re-run with --repair to rebuild their login entries from the accounts.')
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('Reconcile failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => platformPrisma.$disconnect());
