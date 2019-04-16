import Octokit from '@octokit/rest'
import moment from 'moment'

type TEventArgs = {
    username: string
    org?: string
    page: number
}
type TTimeBox = {
    newestMoment: moment.Moment
    daysBack: number
}

const getEvents = async (
    eventArgs: TEventArgs,
    eventFn: (args: TEventArgs) => Promise<Octokit.Response<any>>,
    timebox: TTimeBox
) => {
    let events: any[] = []
    let hasAllEvents = false

    // From the docs: https://developer.github.com/v3/activity/events/
    // Events support pagination, however the per_page option is unsupported.
    // The fixed page size is 30 items. Fetching up to ten pages is supported,
    // for a total of 300 events.
    // Given that, we no longer retrieve events after 10 pages (10 * 30 = 300)
    while (!hasAllEvents && eventArgs.page <= 10) {
        const eventsRes = await eventFn(eventArgs)

        // TODO validate orgEvents results to cast to a strongly typed array

        const filteredEvents = (eventsRes.data as any[]).filter(event => {
            // TODO: Think about removing this filter to support more events... (one may not be the main actor on PR that was merged by someone else)
            if (event.actor.login !== eventArgs.username) {
                return false
            }
            const createdAtMoment = moment(event.created_at).utc()
            return (
                timebox.newestMoment.diff(createdAtMoment, 'days') <=
                timebox.daysBack
            )
        })
        events.push(...filteredEvents)

        // Break out of the loop when there's no filteredEvents
        if (!filteredEvents.length) {
            hasAllEvents = true
        }
    }

    return events
}

const createdAtSort = (a: any, b: any) => {
    // Turn your strings into dates, and then subtract them
    // to get a value that is either negative, positive, or zero.
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

export const getPersonalEvents = async ({
    octokit,
    username,
    timebox,
}: {
    octokit: Octokit
    username: string
    timebox: TTimeBox
}) => {
    const personalEvents = await getEvents(
        {
            username,
            page: 1,
        },
        (args: TEventArgs) => {
            const events = octokit.activity.listEventsForUser(args)
            args.page++
            return events
        },
        timebox
    )
    return personalEvents.sort(createdAtSort)
}

export const getOrganizationEvents = async ({
    octokit,
    username,
    organizations,
    timebox,
}: {
    octokit: Octokit
    username: string
    organizations: string[]
    timebox: TTimeBox
}) => {
    let events: any[] = []

    for (let org of organizations) {
        const orgEvents = await getEvents(
            {
                username,
                org,
                page: 1,
            },
            (args: TEventArgs) => {
                if (typeof args.org !== 'string') {
                    throw Error('org arg required')
                }
                const events = octokit.activity.listEventsForOrg({
                    ...args,
                    org: args.org,
                })
                args.page++
                return events
            },
            timebox
        )
        events.push(...orgEvents)
    }

    return events.sort(createdAtSort)
}
