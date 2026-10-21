export interface Publisher {
  /** Starts a rebuild and deploy of one site (D-028) for this publish job. */
  dispatch(job: {
    jobId: string;
    siteKey: string;
  }): Promise<{ dispatched: boolean; detail: string }>;
}

/** Starts the GitHub Actions publish workflow (D-006) with a token that can only do that. */
export function githubPublisher(config: {
  token: string;
  repository: string;
  workflow: string;
  ref: string;
}): Publisher {
  return {
    async dispatch({ jobId, siteKey }) {
      const response = await fetch(
        `https://api.github.com/repos/${config.repository}/actions/workflows/${config.workflow}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'hantex-admin',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: config.ref, inputs: { job_id: jobId, site: siteKey } }),
        },
      );
      return response.status === 204
        ? { dispatched: true, detail: 'dispatched' }
        : { dispatched: false, detail: `github-status-${response.status}` };
    },
  };
}

/** Used until publishing is configured: jobs are recorded but no build starts. */
export const disabledPublisher: Publisher = {
  dispatch: () => Promise.resolve({ dispatched: false, detail: 'publishing-not-configured' }),
};
