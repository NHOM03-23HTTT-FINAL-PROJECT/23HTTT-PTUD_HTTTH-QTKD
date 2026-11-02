// Test-only bridge. Passwords arrive on stdin and are never printed or written to disk.
import { hash, compare } from 'bcryptjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
process.stdout.write(JSON.stringify({ hash: await hash(request.password, 12), verified: await compare(request.password, request.dotnetHash) }));
