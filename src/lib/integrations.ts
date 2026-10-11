/** Optional Slack / Discord webhook notifications after export. */

export async function notifyExportWebhooks(opts: {
  slackUrl?: string
  discordUrl?: string
  enabled: boolean
  title: string
  path: string
}): Promise<void> {
  if (!opts.enabled) return
  const text = `Bloom export hotový: ${opts.title}\n${opts.path}`

  const jobs: Promise<unknown>[] = []

  if (opts.slackUrl?.startsWith("https://")) {
    jobs.push(
      fetch(opts.slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => null),
    )
  }

  if (opts.discordUrl?.startsWith("https://")) {
    jobs.push(
      fetch(opts.discordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      }).catch(() => null),
    )
  }

  if (jobs.length) await Promise.all(jobs)
}
