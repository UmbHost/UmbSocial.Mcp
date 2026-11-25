// Whether npm's `latest` dist-tag moves to a version just published: node moves-latest.mjs <version> [<current latest>]
// A stable version takes it from a prerelease or an older stable version; a prerelease takes it only from an older prerelease.
// npm's own semver package isn't a dependency here, and this needs only major.minor.patch and the prerelease number.
const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.?(\d+))?$/.exec(v);
  if (!m) throw new Error(`Not a version this understands: ${v}`);
  return { core: m.slice(1, 4).map(Number), pre: m[4] ? [m[4], Number(m[5])] : null };
};
const newer = (a, b) => {
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  if (!a.pre || !b.pre) return !a.pre && !!b.pre;
  return a.pre[0] === b.pre[0] ? a.pre[1] > b.pre[1] : a.pre[0] > b.pre[0];
};
const [version, latest] = process.argv.slice(2);
const next = parse(version);
if (!latest) {
  console.log(true);
} else {
  const current = parse(latest);
  console.log(!next.pre && current.pre ? true : next.pre && !current.pre ? false : newer(next, current));
}
