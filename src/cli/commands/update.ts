import { execSync } from 'child_process';
import { VERSION } from '../../utils/version.js';

export async function updateAction(options: any = {}) {
  const pkgName = '@putervision/state-memory-mcp';
  const binaryName = 'state-memory-mcp';
  console.log(`\n🚀 state-memory-mcp Update Manager`);
  console.log(`==================================`);
  console.log(`Current installed version: v${VERSION}`);
  console.log(`Package: ${pkgName}`);
  console.log(`\n🔄 Fetching and installing the latest version from npm registry...\n`);

  try {
    execSync(`npm install -g ${pkgName}@latest`, {
      encoding: 'utf-8',
      stdio: 'inherit'
    });

    let newVer = VERSION;
    try {
      const checkOut = execSync(`${binaryName} --version`, {
        encoding: 'utf-8'
      }).trim();
      if (checkOut) {
        newVer = checkOut;
      }
    } catch {
      // fallback
    }

    console.log(`\n✨ Update complete! ${pkgName} is now at v${newVer}.`);

    // Auto-restart running MCP server instances if active
    try {
      console.log(`\n🔄 Restarting active ${binaryName} server processes...`);
      const currentPid = process.pid;
      const pgrepOut = execSync(`pgrep -f "${binaryName} run" || true`, { encoding: 'utf-8' }).trim();
      const pids = pgrepOut.split('\n').map(p => parseInt(p.trim(), 10)).filter(p => p && !isNaN(p) && p !== currentPid);

      if (pids.length > 0) {
        for (const pid of pids) {
          try {
            process.kill(pid, 'SIGTERM');
            console.log(`   ✓ Sent SIGTERM restart signal to active server (PID ${pid})`);
          } catch {
            // ignore stale pids
          }
        }
        console.log(`\n💡 Host IDE clients (Cursor, Antigravity, Claude Desktop) will automatically respawn the server with v${newVer}.\n`);
      } else {
        console.log(`   ✓ No background server instances found running.\n`);
      }
    } catch {
      // process discovery fallback
    }
  } catch (err: any) {
    console.error(`\n❌ Failed to update ${pkgName}:`, err.message);
    if (err.message && err.message.includes('EACCES')) {
      console.error(`\n💡 Tip: Permission denied. Try running with elevated privileges:`);
      console.error(`   sudo npm install -g ${pkgName}@latest\n`);
    }
    process.exit(1);
  }
}
