import moment from 'moment'
import axios from 'axios'
import { Handler, Context, Callback } from 'aws-lambda'
import Octokit from '@octokit/rest'
require('dotenv').config()

const env = process.env
if (typeof env.GH_PAT !== 'string' || env.GH_PAT.trim() === '') {
    throw Error('Missing required GH_PAT environment variable')
}
if (typeof env.GH_USERNAME !== 'string' || env.GH_USERNAME.trim() === '') {
    throw Error('Missing required GH_USERNAME environment variable')
}

let slackWebhookUrl: string | undefined
if (
    typeof env.SLACK_WEBHOOK_URL !== 'string' ||
    env.SLACK_WEBHOOK_URL.trim() === ''
) {
    console.warn(
        `No 'SLACK_WEBHOOK_URL' environment variable found. Results will be logged to the console.`
    )
} else {
    slackWebhookUrl = env.SLACK_WEBHOOK_URL.trim()
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
    auth,
})

// TODO: stop using paginate and manually page as needed to go back the 7 (or ideally a configurable
// amount of time) days for performance reasons.

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

const completeHandler = (
    callback: Callback<void>,
    error: Error | null = null
) => {
    callback(error)
}

const handler: Handler<any, void> = (
    _event: any,
    _context: Context,
    callback: Callback<void>
): void => {
    console.log('starting handler...')
    Promise.all(allPromises)
        .then(results => {
            if (!results.length) {
                throw Error('Empty results array upon promises being resolved')
            }

            const yesterday = moment.utc().subtract(1, 'day')
            const allResults: any[] = []
            results.forEach(r => {
                const userResults = r
                    .filter((d: any) => {
                        if (d.actor.login !== username) {
                            return false
                        }

                        const createdAtMoment = moment(d.created_at)
                        return yesterday.diff(createdAtMoment, 'days') < 7
                    })
                    .sort(function(a: any, b: any) {
                        // Turn your strings into dates, and then subtract them
                        // to get a value that is either negative, positive, or zero.
                        return (
                            new Date(b.created_at).getTime() -
                            new Date(a.created_at).getTime()
                        )
                    })
                userResults.forEach((rr: any) => {
                    // only add unique ids to results
                    if (allResults.findIndex(ar => ar.id === rr.id) === -1) {
                        // TODO: Add configurability for these results

                        // TODO: Think about taking into account PRs that were opened, but later closed
                        // and are merged, but were not merged by the author of the PR

                        // TODO: Break out logic here into functions describing the different
                        // conditional that allow a resutls to be added

                        // Events that should be included:
                        // - PRs that were closed and merged (done)
                        // - PRs that were opened and are now closed and merged, but weren't merged by opener
                        // - Commits made to master branches
                        // - Repository was started
                        // - Branch created???
                        // - Checkout https://developer.github.com/v3/activity/events/types/ to discover other important ones
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
                    createdAt: moment(pr.created_at).format(
                        'ddd, MMM Do YYYY, h:mm a'
                    ),
                }
            })
            const payloadText =
                '*My last week on GitHub*\n\n' +
                simplifiedResults
                    .map(r => {
                        return `<${r.url}|${r.title}> (${r.createdAt})\n${
                            r.body
                        }`
                    })
                    .join('\n\n')

            if (typeof slackWebhookUrl === 'undefined') {
                console.log('slackWebhookUrl is undfined so ' + payloadText)
                completeHandler(callback)
            } else {
                axios
                    .post(slackWebhookUrl, {
                        text: payloadText,
                    })
                    .then(_ => {
                        console.log('happy path completeHandler ...')
                        completeHandler(callback)
                    })
                    .catch(rejectionReason => {
                        console.error(
                            'Error POSTing results to slack webhook',
                            rejectionReason
                        )
                        completeHandler(callback, rejectionReason)
                    })
            }
        })
        .catch(rejectionReason => {
            console.error('Error resolving all promises', rejectionReason)
            completeHandler(callback, rejectionReason)
        })
}

exports.handler = handler
