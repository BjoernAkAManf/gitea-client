import { existsSync, statSync, readFileSync, writeFileSync } from 'fs'

// TODO: Also cache last downloaded file (gracefully fail for a while)

const FETCH_PATH = './versions.timeout'
const RATELIMIT_LIMIT = 'x-ratelimit-limit'
const RATELIMIT_RESET = 'x-ratelimit-reset'
const RATELIMIT_REMAINING = 'x-ratelimit-remaining'
const RETRY_AFTER = 'X-Retry-After'
const START_URL = 'https://hub.docker.com/v2/namespaces/gitea/repositories/gitea/tags'
const CHECK_NUM_REGEX = /[0-9]+/

const ENV_VERSION = process.env.CURRENT_VERSION || null

if (ENV_VERSION == null) {
    console.error('Specify Version using ENV Variable!')
    process.exit(6)
}

const [success, currentVersion] = parseVersion(ENV_VERSION)

if (!success) {
    console.error('Could not parse current Version!')
    process.exit(5)
}

function getTime() {
    return Math.floor(new Date().getTime() / 1000)
}

const { getTimeout, updateTimeout, retrieveTimeout } = (() => {
    const state = {}

    function updateCachedTimeout(next) {
        state.time = next
    }

    function getCachedTimeout() {
        const time = state.time
        if (time === undefined) {
            return Promise.resolve(undefined)
        }
        if (time === null) {
            return Promise.resolve(true)
        }
        const now = getTime()
        return Promise.resolve(time <= now)
    }

    return {
        getTimeout: async function () {
            const timeout = await getCachedTimeout()
            if (timeout === undefined) {
                throw new Error('Timeout has to be retrieved at least once!')
            }
            return timeout
        },
        retrieveTimeout: async function () {
            return new Promise((resolve, reject) => {
                if (!existsSync(FETCH_PATH)) {
                    updateCachedTimeout(null)
                    // No file exists => First time running as far as it is known
                    return resolve(getCachedTimeout())
                }
                const stat = statSync(FETCH_PATH)
                if (!stat.isFile()) {
                    return reject('Cache File exists, but is directory')
                }

                updateCachedTimeout(toIntPos(readFileSync(FETCH_PATH, {
                    encoding: 'utf8'
                })))

                // Check the next download interval has passed already
                return resolve(getCachedTimeout())
            })
        },

        updateTimeout: async function (time) {
            updateCachedTimeout(time)
            return new Promise((resolve) => {
                writeFileSync(FETCH_PATH, `${time}`, {
                    encoding: 'utf8'
                })
                return resolve(true)
            })
        }
    }
})()

function toIntPos(str) {
    const type = typeof str
    if (!['string', 'number'.includes(type)]) {
        throw new Error(`Not a valid type provided: ${type}`)
    }

    if (type === 'number' && !CHECK_NUM_REGEX.test(str)) {
        throw new Error('Not a Number: ' + str)
    }

    const num = parseInt(str, 10)
    if (num < 0) {
        // Should probably never be negative, but just in case
        throw new Error(`Not a Positive Number: ${str} (${num})`)
    }
    return num
}

function toString(obj) {
    const type = typeof obj
    if (type !== 'string') {
        throw new Error(`Not a valid type provided: ${type}`)
    }
    return obj
}

function toObjArray(obj) {
    if (!Array.isArray(obj)) {
        throw new Error('Not an Array!' + obj)
    }

    const nonObject = obj
        .filter(i => typeof i !== 'object').length > 0

    if (nonObject) {
        throw new Error(`Object Array contains non-objects: ${nonObject}`)
    }

    return obj
}

async function download(url) {
    const resp = await fetch(url)

    if (resp.status === 429) {
        const retry = toIntPos(resp.headers.get(RETRY_AFTER))
        await updateTimeout(retry)
        throw new Error(`Too many requests`)
    }

    const ok = resp.ok

    if (!ok) {
        throw new Error(`HTTP Failure (${resp.status}): ${await resp.text()}`)
    }

    const limit = toIntPos(resp.headers.get(RATELIMIT_LIMIT))
    const remaining = toIntPos(resp.headers.get(RATELIMIT_REMAINING))
    const reset = toIntPos(resp.headers.get(RATELIMIT_RESET))
    const json = await resp.json()

    if ((remaining <= 0) || (remaining <= limit / 10)) {
        await updateTimeout(reset)
        // Process data anyway, but quit after this
    }

    return json
}

function onDownloadErrors(ex) {
    console.error('Download failed', ex)
    process.exit(4)
}

function parseVersion(name) {
    const SKIP = [false, null]
    const excludes = ['latest', 'dev']
    const skips = ['-rootless', '-arm64', '-dev', '-amd64', '-rc']

    for (const skip of skips) {
        if (name.includes(skip) || excludes.includes(name)) {
            return SKIP
        }

    }

    const parts = name.split('.')

    if (parts.length !== 3) {
        // Only care for full version specifications
        return SKIP
    }

    const version = parts
        .map(part => toIntPos(part))

    return [true, version]
}

function compareVersion(left, right) {
    const len = Math.min(left.length, right.length)
    let i = 0
    for (; i < len; i += 1) {
        if (left[i] > right[i]) {
            return 1
        }
        if (left[i] < right[i]) {
            return -1
        }
    }

    const [l, p] = left.length > right.length ? [left, 1] : [right, -1]
    for (; i < len; i += 1) {
        if (l[i] > 0) {
            return p
        }
    }

    return 0
}

async function downloadResults(url, currentVersion) {
    const timeout = await getTimeout()
    if (!timeout) {
        throw new Error('Timeout has been reached!')
    }

    const resp = await download(url)
        .catch(onDownloadErrors)

    // const count = toIntPos(resp.count)

    const versionsFound = toObjArray(resp.results)
        .map(result => toString(result.name))
        .map(name => parseVersion(name))
        .filter(([ignore]) => ignore)
        .map(([, number]) => number)

    const results = versionsFound
        .filter(number => {
            const m = compareVersion(currentVersion, number)
            // Only current Version smaller than the provided Version is acceptable
            return m < 0
        })

    const next = ((next) => {
        if (next !== null) {
            return toString(next)
        }
        return next
    })(resp.next)

    const res = []
    results.forEach(result => res.push(result))

    // Assume pages are sorted by Versions, so if we find suitable versions, but none are bigger, no need to search the next page
    const versionsTooOld = versionsFound.length > 0 && results.length === 0

    if (!versionsTooOld && next) {
        (await downloadResults(next, currentVersion))
            .forEach(result => res.push(result))
    }

    return res
}

function reportVersions(versions) {
    if (versions.length <= 0) {
        console.error('Everything up to date')
        process.exit(0)
    }

    console.error('New versions found')
    versions
        .map(v => v.join('.'))
        .forEach(version => console.log(version))

    process.exit(10)
}

retrieveTimeout()
    .then((ok) => {
        if (!ok) {
            console.error('Timeout reached, not retrying again')
            process.exit(3)
        }
    })
    .then(() => downloadResults(START_URL, currentVersion))
    .then((results) => reportVersions(results))
    .catch(ex => {
        console.error('Retrieval of Timeout failed', ex)
        process.exit(2)
    })