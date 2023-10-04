import 'string.prototype.replaceall/auto.js';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import getJSON from 'get-json';
import semverMajor from 'semver/functions/major.js';
import semverMinor from 'semver/functions/minor.js';
import semverCompare from 'semver/functions/compare.js';

const dir = path.dirname(new URL(import.meta.url).pathname);

yaml.scalarOptions.str.doubleQuoted.minMultiLineLength = Infinity;
yaml.scalarOptions.str.fold.lineWidth = Infinity;
function parse(str) {
	return yaml.parse(str, {
		keepCstNodes: true,
	});
}
function stringify(obj) {
	return yaml.stringify(obj, {
		keepCstNodes: true,
	});
}

function commentSpecificFileRows(rows, start, count, commentWholeLine) {
	return rows.slice(start, start + 1 + count).map((x) => {
		const altFilename = x.match(/([^.\s/]+\.yml)$/);
		return `${commentWholeLine ? x.replace(/^(\s*)(\S)/, '$1#$2') : x}${altFilename ? ` # ../${altFilename[1]}` : ''}`;
	});
}
function commentFileRows(ymlObject, start, count, commentWholeLine) {
	const rows = stringify(ymlObject).split('\n');
	return [].concat(
		rows.slice(0, start),
		commentSpecificFileRows(rows, start, count, commentWholeLine),
		rows.slice(start + count + 1),
	).join('\n').replace(/: \[\]$/gm, ':');
}

{ // dep updaters
	const updaterTemplate = String(await fs.readFile(path.join(dir, './templates/dep-updater.yml')));
	const updatersYml = parse(updaterTemplate);
	const { matrix } = updatersYml;
	delete updatersYml.matrix;
	updatersYml.import = [];
	updatersYml.matrix = {
		...matrix,
		exclude: [],
	};
	const services = [
		'renovate',
		'greenkeeper',
		'dependabot',
	];
	for (const svc of services) {
		const yml = parse(updaterTemplate.replaceAll('${service}', svc));
		updatersYml.matrix.exclude.push(...yml.matrix.exclude);
		updatersYml.import.push(`ljharb/travis-ci:node/${svc}.yml`);
		// eslint-disable-next-line no-await-in-loop
		await fs.writeFile(path.join(dir, `${svc}.yml`), yaml.stringify(yml, {
			keepCstNodes: true,
		}));
	}
	const updatersYmlRows = stringify(updatersYml).split('\n');
	const updatersYmlContents = [
		updatersYmlRows[0],
		'# these have been inlined instead of imported due to travis\' silly import limit',
		...commentSpecificFileRows(updatersYmlRows, 1, services.length, true),
		...updatersYmlRows.slice(2 + services.length),
	].join('\n');
	await fs.writeFile(path.join(dir, 'dep-updaters.yml'), updatersYmlContents);
}

async function getNodeVersions(type = 'nodejs') {
	const index = await getJSON(`https://${type}.org/dist/index.json`).catch((e) => {
		console.error('Error fetching and parsing JSON from `https://nodejs.org/dist/index.json`');
		throw e;
	});
	return {
		versions: index.map(({ version }) => version),
		index,
	};
}

function getMinorsByMajor(versions) {
	const minorEntries = versions.map((v) => [`${semverMajor(v)}`, `${semverMajor(v)}.${semverMinor(v)}`]);
	const minorsByMajor = {};
	minorEntries.forEach(([maj, v]) => {
		minorsByMajor[maj] = Array.from(new Set([].concat(minorsByMajor[maj] || [], v)));
	});
	return minorsByMajor;
}

const minorTemplate = String(await fs.readFile(path.join(dir, './templates/minor.yml')));
const minorYml = parse(minorTemplate);
const [originalInclude] = minorYml.matrix.include;
const originalMinorKeys = Object.keys(minorYml);
function sortByOriginalKeys([a], [b]) {
	return originalMinorKeys.indexOf(a) - originalMinorKeys.indexOf(b);
}

{ // iojs
	const { versions: iojsVersions } = await getNodeVersions('iojs');
	const minorsByMajor = getMinorsByMajor(iojsVersions);

	const iojsMinorYml = parse(minorTemplate);
	iojsMinorYml.node_js.length = 0;
	iojsMinorYml.matrix.include.length = 0;

	const iojsMajors = [];

	Object.entries(minorsByMajor).reverse().forEach(([, minors]) => {
		const [first, ...rest] = minors;
		iojsMinorYml.node_js.push(`iojs-v${first}`);
		iojsMajors.push(`iojs-v${semverMajor(`${first}.0`)}`);

		iojsMinorYml.matrix.include.push(...rest.map((minor) => {
			const { node_js: _, ...minorRest } = originalInclude; // eslint-disable-line no-unused-vars
			return {
				node_js: `iojs-v${minor}`,
				...minorRest,
			};
		}));

	});

	delete iojsMinorYml.before_install;
	delete iojsMinorYml.after_install;

	const majorCount = Object.keys(minorsByMajor).length;

	const newIojsMinorYml = Object.fromEntries(Object.entries(iojsMinorYml).sort(sortByOriginalKeys));
	const newIojsContents = commentFileRows(newIojsMinorYml, 4 + majorCount, minorYml.import.length, false);
	fs.writeFile(path.join(dir, 'minors', 'iojs.yml'), newIojsContents);

	const allMajorYml = {
		language: 'node_js',
		node_js: iojsMajors,
		matrix: {
			fast_finish: true,
		},
		import: minorYml.import,
	};
	const iojsMajorContents = commentFileRows(allMajorYml, 2 + iojsMajors.length + 2, minorYml.import.length, false);
	fs.writeFile(path.join(dir, 'majors', 'iojs.yml'), iojsMajorContents);
}

{ // 4+ minors/majors
	const { versions, index } = await getNodeVersions();

	// LTS
	const ltsMinors = index.filter((x) => x.lts).map(({ version: v, lts }) => [lts, `${semverMajor(v)}.${semverMinor(v)}`]);
	const ltsLatestMinors = {};
	ltsMinors.forEach(([lts, v]) => {
		ltsLatestMinors[lts] = Array.from(new Set([].concat(
			ltsLatestMinors[lts] || [],
			v,
		).sort((a, b) => semverCompare(`${b}.0`, `${a}.0`))));
	});
	const ltsMinorsWithStarting = Object.values(ltsLatestMinors).map(([latest, ...rest]) => [latest, rest[rest.length - 1] || latest]);

	const OLDEST_ACTIVE_LTS = 10;
	[true, false].forEach((isActive) => {
		const filteredLTSMinors = ltsMinorsWithStarting.filter(([x]) => (isActive ? x >= OLDEST_ACTIVE_LTS : x < OLDEST_ACTIVE_LTS));
		const ltsMinorYml = {
			import: filteredLTSMinors.map(([x]) => `./${semverMajor(`${x}.0`)}.yml`).concat(minorYml.import),
		};
		const ltsMajorYml = {
			language: 'node_js',
			node_js: filteredLTSMinors.map(([x]) => semverMajor(`${x}.0`)),
			matrix: {
				fast_finish: true,
			},
			import: minorYml.import,
		};
		let ltsMinorContents = commentFileRows(ltsMinorYml, filteredLTSMinors.length + 1, minorYml.import.length, false);
		let ltsMajorContents = commentFileRows(ltsMajorYml, filteredLTSMinors.length + 5, minorYml.import.length, false);
		if (isActive) {
			const regex = /(\d+)(\.yml)?$/gm;
			function replacer(_, major, ext = '') {
				const firstVersion = filteredLTSMinors.map(([, first]) => first).find((f) => String(semverMajor(`${f}.0`)) === major);
				return `${major}${ext} # ${firstVersion}+`;
			}
			ltsMinorContents = ltsMinorContents.replaceAll(regex, replacer);
			ltsMajorContents = ltsMajorContents.replaceAll(regex, replacer);
		}
		fs.writeFile(path.join(dir, 'minors', `LTS-${isActive ? 'active' : 'EOL'}.yml`), ltsMinorContents);
		fs.writeFile(path.join(dir, 'majors', `LTS-${isActive ? 'active' : 'EOL'}.yml`), ltsMajorContents);
	});

	const majors = Array.from(new Set(versions.map((v) => semverMajor(v)).filter(Boolean).map(String)));

	// GTEs
	majors.filter((x) => x % 2 === 0).forEach((x) => {
		const gteMajors = majors.slice(0, majors.findIndex((y) => y === x) + 1);
		const gteMinorYml = {
			import: gteMajors.map((m) => `./${m}.yml`).concat(minorYml.import),
		};
		const gteMinorContents = commentFileRows(gteMinorYml, gteMajors.length + 1, minorYml.import.length, false);
		fs.writeFile(path.join(dir, 'minors', `gte_${x}.yml`), gteMinorContents);

		const gteMajorYml = {
			language: 'node_js',
			node_js: gteMajors,
			import: minorYml.import,
		};
		const gteMajorContents = commentFileRows(gteMajorYml, gteMajors.length + 3, minorYml.import.length, false);
		fs.writeFile(path.join(dir, 'majors', `gte_${x}.yml`), gteMajorContents);
	});

	// all
	const lastEven = majors.find((x) => x % 2 === 0);
	const lastGTEMajors = majors.slice(0, majors.findIndex((x) => x === lastEven) + 1);
	const allMinorContents = stringify({
		import: ['iojs'].concat(
			majors.filter((x) => !lastGTEMajors.includes(x)).reverse(),
			`gte_${lastEven}`,
		).map((x) => `./${x}.yml`),
	});
	await fs.writeFile(path.join(dir, 'minors', 'all.yml'), allMinorContents);

	// minors
	const minorsByMajor = getMinorsByMajor(versions);
	const minorYmls = Object.entries(minorsByMajor).filter(([major]) => major >= 4).map(([major, minors]) => {
		const [first, ...rest] = minors;
		const minorByMajorYml = parse(minorTemplate);
		minorByMajorYml.node_js = [first];

		minorByMajorYml.matrix.include = rest.map((minor) => {
			const { node_js: _, ...minorRest } = originalInclude; // eslint-disable-line no-unused-vars
			return {
				node_js: minor,
				...minorRest,
			};
		});

		if (major === '5') {
			minorByMajorYml.before_install = ['case "${TRAVIS_NODE_VERSION}" in 5.*) nvm install --latest-npm 6; export TRAVIS_RESET_NODE_VERSION=1 ;; esac;'];
			minorByMajorYml.after_install = ['if [ "${TRAVIS_RESET_NODE_VERSION-}" = 1 ]; then nvm use "${TRAVIS_NODE_VERSION}"; export TRAVIS_RESET_NODE_VERSION=0; fi'];
		} else if (major === '6') {
			minorByMajorYml.before_install = ['case "${TRAVIS_NODE_VERSION}" in 6.1|6.2) nvm install --latest-npm 6; export TRAVIS_RESET_NODE_VERSION=1 ;; esac;'];
			minorByMajorYml.after_install = ['if [ "${TRAVIS_RESET_NODE_VERSION-}" = 1 ]; then nvm use "${TRAVIS_NODE_VERSION}"; export TRAVIS_RESET_NODE_VERSION=0; fi'];
		} else if (major === '9') {
			minorByMajorYml.before_install = ['case "${TRAVIS_NODE_VERSION}" in 9.0|9.1|9.2) nvm install --latest-npm 9; export TRAVIS_RESET_NODE_VERSION=1 ;; esac;'];
			minorByMajorYml.after_install = ['if [ "${TRAVIS_RESET_NODE_VERSION-}" = 1 ]; then nvm use "${TRAVIS_NODE_VERSION}"; export TRAVIS_RESET_NODE_VERSION=0; fi'];
		} else {
			delete minorByMajorYml.before_install;
			delete minorByMajorYml.after_install;
		}
		const newMinorYml = Object.fromEntries(Object.entries(minorByMajorYml).sort(sortByOriginalKeys));
		const newMinorContents = commentFileRows(newMinorYml, 5, minorByMajorYml.import.length, false);
		fs.writeFile(path.join(dir, 'minors', `${major}.yml`), newMinorContents);
		return newMinorYml;
	});
	const allMinorYmls = minorYmls.reduceRight((prev, yml) => ({
		...prev,
		...yml,
		node_js: [].concat(prev.node_js || [], yml.node_js || []),
		import: [...new Set([].concat(prev.import || [], yml.import || []))],
		before_install: [...new Set([].concat(prev.before_install || [], yml.before_install || []))],
		after_install: [...new Set([].concat(prev.after_install || [], yml.after_install || []))],
		matrix: {
			...prev.matrix,
			include: [].concat(prev?.matrix?.include || [], yml.matrix.include || []),
			allow_failures: Array.from(
				new Set([].concat(prev?.matrix?.allow_failures || [], yml.matrix.allow_failures).map((x) => JSON.stringify(x))),
				(x) => JSON.parse(x),
			),
		},
	}), {});
	const gte4MinorContents = commentFileRows(allMinorYmls, 5, minorYml.import.length, false);
	fs.writeFile(path.join(dir, 'minors', 'gte_4.yml'), gte4MinorContents);
}
