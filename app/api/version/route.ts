import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name: string; version: string };
  return NextResponse.json({
    name: pkg.name,
    version: pkg.version,
    node: process.version,
  });
}
