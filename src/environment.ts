type TEnvironment = {
    ghAccessToken: string
    ghUsername: string
    ghOrganizations: string[]
    daysBack: number
    excludePersonal: boolean
    slackWebhookUrl?: string
}

export const getEnvironment = (): TEnvironment => {
    require('dotenv').config()
    const env = process.env

    if (typeof env.GH_PAT !== 'string' || env.GH_PAT.trim() === '') {
        throw Error('Missing required GH_PAT environment variable')
    }
    const ghAccessToken = env.GH_PAT.trim()

    if (typeof env.GH_USERNAME !== 'string' || env.GH_USERNAME.trim() === '') {
        throw Error('Missing required GH_USERNAME environment variable')
    }
    const ghUsername = env.GH_USERNAME.trim()

    const ghOrganizations = []
    if (typeof env.GH_ORGANIZATIONS === 'string') {
        try {
            const envOrgs = JSON.parse(env.GH_ORGANIZATIONS.trim())
            if (Array.isArray(envOrgs)) {
                ghOrganizations.push(
                    ...envOrgs
                        .filter(o => typeof o === 'string' && o.trim() !== '')
                        .map(o => o as string)
                )
            }
        } catch (err) {
            throw err
        }
    }

    const excludePersonal =
        typeof env.EXCLUDE_PERSONAL === 'string' &&
        env.EXCLUDE_PERSONAL.toLowerCase().trim() === 'true'

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

    let daysBack = 7
    if (
        typeof env.DAYS_BACK === 'string' &&
        parseInt(env.DAYS_BACK.trim(), 10) > 0
    ) {
        daysBack = parseInt(env.DAYS_BACK.trim(), 10)
    }

    return {
        ghAccessToken,
        ghUsername,
        ghOrganizations,
        excludePersonal,
        daysBack,
        slackWebhookUrl,
    }
}
