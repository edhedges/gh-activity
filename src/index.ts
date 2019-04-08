import fs from 'fs'
import moment from 'moment'
const Octokit = require('@octokit/rest')
require('dotenv').config()

const env = process.env
if (typeof env.GH_PAT !== 'string' || env.GH_PAT.trim() === '') {
    throw Error('Missing required GH_PAT environment variable')
}
if (typeof env.GH_USERNAME !== 'string' || env.GH_USERNAME.trim() === '') {
    throw Error('Missing required GH_USERNAME environment variable')
}

const auth = env.GH_PAT.trim()
const username = env.GH_USERNAME.trim()
const organizations = []

if (typeof env.GH_ORGANIZATIONS === 'string') {
    try {
        const envOrgs = JSON.parse(env.GH_ORGANIZATIONS.trim())
        if (Array.isArray(envOrgs)) {
            organizations.push(
                ...envOrgs
                    .filter(o => typeof o === 'string' && o.trim() !== '')
                    .map(o => o as string)
            )
        }
    } catch (err) {
        throw err
    }
}

const octokit = new Octokit({
    auth: env.GH_PAT,
})
const orgPromises = organizations.map(org =>
    octokit.paginate('GET /users/:username/events/orgs/:org', {
        username,
        org,
    })
)
const allPromises = [
    octokit.paginate('GET /users/:username/events', {
        username,
    }),
    ...orgPromises,
]

console.log('Starting at: ' + new Date())
Promise.all(allPromises)
    .then(results => {
        console.log('Retrieved ' + results.length + ' results at ' + new Date())
        if (!results.length) {
            throw Error('Empty results array upon promises being resolved')
        }

        const yesterday = moment.utc().subtract(1, 'day')
        console.log('Yesterday is ' + yesterday)
        const allResults: any[] = []
        results.forEach(r => {
            const userResults = r.filter((d: any) => {
                if (d.actor.login !== username) {
                    return false
                }

                const createdAtMoment = moment(d.created_at)
                return yesterday.diff(createdAtMoment, 'days') < 7
            })
            userResults.forEach((rr: any) => {
                // only add unique ids to results
                if (allResults.findIndex(ar => ar.id === rr.id) === -1) {
                    // TODO: Add configurability for these results

                    // TODO: Think about taking into account PRs that were opened, but later closed
                    // and are merged, but were not merged by the author of the PR

                    // TODO: Break out logic here into functions describing the different
                    // conditional that allow a resutls to be added
                    if (
                        rr.type === 'PullRequestEvent' &&
                        rr.payload.action === 'closed' &&
                        rr.payload.pull_request.merged === true
                    ) {
                        allResults.push(rr)
                    }
                }
            })
        })
        const simplifiedResults = allResults.map(r => {
            const pr = r.payload.pull_request
            return {
                url: pr.html_url,
                title: pr.title,
                body: pr.body,
            }
        })
        const filePath = '/tmp/gh-activity-events.json'
        fs.writeFile(
            filePath,
            JSON.stringify({ results: simplifiedResults }),
            function(err) {
                if (err) {
                    console.log(err)
                } else {
                    console.log(`File saved to '${filePath}'`)
                }
            }
        )
    })
    .catch(rejectionReason => {
        console.log('Error resolving all promises', rejectionReason)
    })
