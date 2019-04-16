import moment from 'moment'
import axios from 'axios'
import { Handler, Context, Callback } from 'aws-lambda'
import Octokit from '@octokit/rest'
import { getOrganizationEvents, getPersonalEvents } from './events-api'
import { getEnvironment } from './environment'

const env = getEnvironment()
const octokit = new Octokit({
    auth: env.ghAccessToken,
})
const newestMoment = moment.utc()
const baseGetEventArgs = {
    octokit,
    username: env.ghUsername,
    timebox: {
        newestMoment,
        daysBack: env.daysBack,
    },
}
const allPromises = [
    getOrganizationEvents({
        organizations: env.ghOrganizations,
        ...baseGetEventArgs,
    }),
]
if (!env.excludePersonal) {
    allPromises.push(getPersonalEvents(baseGetEventArgs))
}

/**
 * Implements simple wrapper around: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html#nodejs-prog-model-handler-callback
 */
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
    Promise.all(allPromises)
        .then(results => {
            if (!results.length) {
                throw Error('Empty results array upon promises being resolved')
            }

            const allResults: any[] = []
            results.forEach(r => {
                r.forEach((rr: any) => {
                    // only add unique ids to results
                    if (allResults.findIndex(ar => ar.id === rr.id) === -1) {
                        // TODO: Add configurability for these results

                        // TODO: Think about taking into account PRs that were opened, but later closed
                        // and are merged, but were not merged by the author of the PR

                        // TODO: Break out logic here into functions describing the different
                        // conditional that allow a results to be added

                        // Events that should be included:
                        // - PRs that were closed and merged (done)
                        // - PRs that were opened and are now closed and merged, but weren't merged by opener
                        // - Commits made to master branches
                        // - Repository was started
                        // - Branch created???
                        // - Checkout https://developer.github.com/v3/activity/events/types/ to discover other important ones

                        // TODO: Only include commits that are to master, but not from a PR... (PRs contain a commits url which can be retrieved)
                        // if (rr.type === 'PushEvent') {
                        //     console.log(JSON.stringify(rr, null, 2))
                        //     allResults.push(
                        //         ...rr.payload.commits.map((c: any) => ({
                        //             commit: c,
                        //             ...rr,
                        //         }))
                        //     )
                        // }
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
                // if (r.type === 'PullRequestEvent') {
                const pr = r.payload.pull_request
                return {
                    url: pr.html_url,
                    title: pr.title,
                    body: pr.body,
                    createdAt: moment(pr.created_at).format(
                        'ddd, MMM Do YYYY, h:mm a'
                    ),
                }
                // } else if (r.type === 'PushEvent') {
                //     return {
                //         url: r.commit.url,
                //         title: r.commit.message,
                //         body: '',
                //         createdAt: moment(r.created_at).format(
                //             'ddd, MMM Do YYYY, h:mm a'
                //         ),
                //     }
                // } else {
                //     return {}
                // }
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

            if (typeof env.slackWebhookUrl === 'undefined') {
                completeHandler(callback)
            } else {
                axios
                    .post(env.slackWebhookUrl, {
                        text: payloadText,
                    })
                    .then(_ => {
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
