const https = require("https");

class PluginAuditor {
  constructor(githubToken = null) {
    this.githubToken = githubToken;
  }

  /**
   * Make an HTTPS request
   * @param {string} url - The URL to request
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Parsed JSON response
   */
  makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const headers = {
        "User-Agent": "Maiar-Plugin-Auditor",
        Accept: "application/vnd.github.v3+json",
        ...options.headers,
      };

      if (this.githubToken && url.includes("api.github.com")) {
        headers["Authorization"] = `token ${this.githubToken}`;
      }

      const req = https.get(url, { headers }, (res) => {
        let data = "";

        // Add rate limit information for GitHub requests
        if (url.includes("api.github.com")) {
          const rateLimit = {
            limit: res.headers["x-ratelimit-limit"],
            remaining: res.headers["x-ratelimit-remaining"],
            reset: res.headers["x-ratelimit-reset"],
          };
          if (rateLimit.remaining === "0") {
            const resetDate = new Date(rateLimit.reset * 1000);
            reject({
              status: 429,
              message: `GitHub API rate limit exceeded. Resets at ${resetDate.toLocaleString()}`,
              rateLimit,
              response: { status: 429 },
            });
            return;
          }
        }

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject({
              status: res.statusCode,
              message: `HTTP ${res.statusCode}: ${data}`,
              response: {
                status: res.statusCode,
                headers: res.headers,
                body: data,
              },
            });
            return;
          }

          try {
            resolve({
              data: JSON.parse(data),
              status: res.statusCode,
              headers: res.headers,
            });
          } catch (error) {
            reject({
              status: 500,
              message: `Failed to parse JSON response: ${error.message}`,
              error,
              data,
            });
          }
        });
      });

      req.on("error", (error) => {
        reject({
          status: 500,
          message: `Network error: ${error.message}`,
          error,
        });
      });

      req.end();
    });
  }

  /**
   * Audit a plugin submission
   * @param {Object} submission - The plugin submission object
   * @param {string} submission.repo - The repository name
   * @param {string} submission.owner - The GitHub username or organization
   * @param {string} submission.npm_package_name - The npm package name
   * @returns {Promise<{ passed: boolean, issues: string[] }>}
   */
  async auditPlugin(submission) {
    const issues = [];
    let repoData = null;
    let npmData = null;

    try {
      // Check if all required fields are present
      if (
        !submission.repo ||
        !submission.owner ||
        !submission.npm_package_name
      ) {
        issues.push("Missing required fields in submission");
        return { passed: false, issues };
      }

      // Fetch GitHub repository data
      try {
        const repoResponse = await this.makeRequest(
          `https://api.github.com/repos/${submission.owner}/${submission.repo}`
        );
        repoData = repoResponse;

        // Log rate limit information
        if (repoResponse.headers) {
          console.log("\nGitHub API Rate Limit Info:");
          console.log(
            `Remaining: ${repoResponse.headers["x-ratelimit-remaining"]}`
          );
          console.log(`Limit: ${repoResponse.headers["x-ratelimit-limit"]}`);
          const resetTime = new Date(
            repoResponse.headers["x-ratelimit-reset"] * 1000
          );
          console.log(`Resets at: ${resetTime.toLocaleString()}`);
        }
      } catch (error) {
        if (error.status === 429) {
          issues.push(error.message);
        } else if (error.response?.status === 404) {
          issues.push("GitHub repository not found");
        } else if (error.response?.status === 403) {
          issues.push(`GitHub API access forbidden: ${error.message}`);
        } else {
          issues.push(`Error accessing GitHub repository: ${error.message}`);
          if (error.response?.body) {
            console.error("GitHub API Response:", error.response.body);
          }
        }
      }

      // Only check GitHub-specific requirements if we have repository data
      if (repoData) {
        // Check if repository is public
        if (repoData.data.private) {
          issues.push("Repository must be public");
        }

        // Check repository description
        if (
          !repoData.data.description ||
          repoData.data.description.trim().length < 10
        ) {
          issues.push(
            "Repository must have a clear, descriptive description (minimum 10 characters)"
          );
        }

        // Check repository topics
        try {
          const topicsResponse = await this.makeRequest(
            `https://api.github.com/repos/${submission.owner}/${submission.repo}/topics`,
            {
              headers: {
                Accept: "application/vnd.github.mercy-preview+json",
              },
            }
          );

          if (!topicsResponse.data.names.includes("maiar")) {
            issues.push('Repository must have the "maiar" topic tagged');
          }
        } catch (error) {
          issues.push(`Error checking repository topics: ${error.message}`);
        }
      }

      // Check npm package
      try {
        const npmResponse = await this.makeRequest(
          `https://registry.npmjs.org/${encodeURIComponent(
            submission.npm_package_name
          )}`
        );
        npmData = npmResponse.data;

        // Check if npm package is public
        if (npmData.private) {
          issues.push("npm package must be public");
        }

        // Check repository URL in package.json matches GitHub repository
        if (repoData) {
          // Only check if we have GitHub data
          const normalizedRepoUrl = this.normalizeRepositoryUrl(
            npmData.repository
          );
          if (
            !normalizedRepoUrl.includes(
              `${submission.owner}/${submission.repo}`
            )
          ) {
            issues.push(
              "npm package repository URL must match GitHub repository"
            );
          }
        }
      } catch (error) {
        if (error.response?.status === 404) {
          issues.push("npm package not found");
        } else {
          issues.push(`Error accessing npm package: ${error.message}`);
        }
      }
    } catch (error) {
      issues.push(`Unexpected error during audit: ${error.message}`);
    }

    // Always return metadata even if there are issues
    return {
      passed: issues.length === 0,
      issues,
      metadata: {
        github: repoData?.data
          ? {
              name: repoData.data.name,
              owner: repoData.data.owner.login,
              fullName: repoData.data.full_name,
              stars: repoData.data.stargazers_count,
              description: repoData.data.description,
              topics: repoData.data.topics,
              lastUpdated: repoData.data.updated_at,
              isPublic: !repoData.data.private,
              url: `https://github.com/${submission.owner}/${submission.repo}`,
            }
          : null,
        npm: npmData
          ? {
              name: submission.npm_package_name,
              version: npmData["dist-tags"]?.latest,
              lastPublished: npmData.time?.modified,
              author:
                typeof npmData.author === "object"
                  ? {
                      name: npmData.author?.name,
                      email: npmData.author?.email,
                      url: npmData.author?.url,
                    }
                  : { name: npmData.author, email: null, url: null },
              maintainers: npmData.maintainers || [],
              url: `https://www.npmjs.com/package/${submission.npm_package_name}`,
            }
          : null,
      },
    };
  }

  /**
   * Normalize repository URL to a standard format
   * @param {string|Object} repository - Repository URL or object from package.json
   * @returns {string} Normalized repository URL
   */
  normalizeRepositoryUrl(repository) {
    if (!repository) return "";
    if (typeof repository === "string") return repository;
    if (typeof repository === "object" && repository.url) return repository.url;
    return "";
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node audit.js <submission-json>");
    console.log(
      'Example: node audit.js \'{"repo": "my-plugin", "owner": "username", "npm_package_name": "my-package"}\''
    );
    process.exit(1);
  }

  const submission = JSON.parse(process.argv[2]);
  const githubToken = process.env.GITHUB_TOKEN; // Optional now
  const auditor = new PluginAuditor(githubToken);

  try {
    console.log("\nRunning audit...");
    if (!githubToken) {
      console.log(
        "Note: Running without GitHub token. Rate limits will be stricter."
      );
    }

    const result = await auditor.auditPlugin(submission);

    console.log("\nPlugin Information:");
    console.log("==================");
    if (result.metadata?.github) {
      console.log(`Repository: ${result.metadata.github.fullName}`);
      console.log(`Owner: ${result.metadata.github.owner}`);
    } else {
      console.log("GitHub repository information not available");
    }

    if (result.metadata?.npm) {
      console.log(`NPM Package: ${result.metadata.npm.name}`);
      const author = result.metadata.npm.author;
      console.log(
        `Author: ${
          typeof author === "object"
            ? author.name || "Unknown"
            : author || "Unknown"
        }`
      );
    } else {
      console.log("NPM package information not available");
    }

    console.log("\nAudit Results:");
    console.log("=============");
    console.log(`Status: ${result.passed ? "✅ PASSED" : "❌ FAILED"}`);

    if (result.issues && result.issues.length > 0) {
      console.log("\nIssues Found:");
      result.issues.forEach((issue) => console.log(`- ${issue}`));
    }

    // Always show complete metadata structure
    console.log("\nDetailed Metadata:");
    const fullMetadata = {
      submission: {
        repo: submission.repo || "N/A",
        owner: submission.owner || "N/A",
        npm_package_name: submission.npm_package_name || "N/A",
      },
      github: result.metadata?.github
        ? {
            name: result.metadata.github.name || "N/A",
            owner: result.metadata.github.owner || "N/A",
            fullName: result.metadata.github.fullName || "N/A",
            stars: result.metadata.github.stars || 0,
            description: result.metadata.github.description || "N/A",
            topics: result.metadata.github.topics || [],
            lastUpdated: result.metadata.github.lastUpdated || "N/A",
            isPublic: !result.metadata.github.private,
            url: `https://github.com/${submission.owner}/${submission.repo}`,
          }
        : {
            name: "N/A",
            owner: "N/A",
            fullName: "N/A",
            stars: 0,
            description: "N/A",
            topics: [],
            lastUpdated: "N/A",
            isPublic: "Unknown",
            url: `https://github.com/${submission.owner}/${submission.repo}`,
          },
      npm: result.metadata?.npm
        ? {
            name: result.metadata.npm.name || "N/A",
            version: result.metadata.npm.version || "N/A",
            lastPublished: result.metadata.npm.lastPublished || "N/A",
            author:
              typeof result.metadata.npm.author === "object"
                ? {
                    name: result.metadata.npm.author?.name || "N/A",
                    email: result.metadata.npm.author?.email || "N/A",
                    url: result.metadata.npm.author?.url || "N/A",
                  }
                : {
                    name: result.metadata.npm.author || "N/A",
                    email: "N/A",
                    url: "N/A",
                  },
            maintainers: result.metadata.npm.maintainers || [],
            url: `https://www.npmjs.com/package/${submission.npm_package_name}`,
          }
        : {
            name: "N/A",
            version: "N/A",
            lastPublished: "N/A",
            author: { name: "N/A", email: "N/A", url: "N/A" },
            maintainers: [],
            url: `https://www.npmjs.com/package/${submission.npm_package_name}`,
          },
    };

    console.log(JSON.stringify(fullMetadata, null, 2));
  } catch (error) {
    console.error("Error running audit:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = PluginAuditor;
