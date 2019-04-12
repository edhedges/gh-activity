# gh-activity

Receive a Slack message summarizing your GitHub activity for the previous week! The codebase is structured to be deployed as an AWS Lambda function that's invoked on a schedule with AWS CloudWatch Events. Deployment documentation can be found here: https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/RunLambdaSchedule.html

### TODOs

-   Add CI/CD (and the requisite branch rules) that deploys to Lambda upon successful PRs being merged into master.
-   Improve speed/efficiency by not using `octokit.paginate`, but instead handle pagination up until the desired date.
-   Add configurability
    -   Require explicitly intending personal (non-organization) activity be retrieved
    -   Add a way to declare the different types of events to retrive / summarize
    -   Add the desired amount of time to go back to when retrieving the events
-   Improve formatting of Slack summary and based upon research of available data provide more information in the summary if valuable
-   Support different mediums for receiving the notification like email
-   Add a different mode of execution that would allow receiving the .env variables as parameters. This would theoritically allow any client(s) to provide gh-activity the required parameters and be notified
    upon execution (this would likely require some form of payment).
