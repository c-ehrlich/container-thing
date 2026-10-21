import { graphql } from "./graphql/graphql";
import type { RailwayClient } from "./railway-api";

/**
 * With `project:*` OAuth scopes, `projects` is not authorized; `externalWorkspaces` lists exactly the
 * projects the user shared on the consent screen, grouped by workspace.
 * https://docs.railway.com/integrations/oauth/fetching-workspaces-or-projects
 */
const ViewerQuery = graphql(`
  query Viewer {
    me {
      name
      email
      avatar
    }
    externalWorkspaces {
      id
      name
      projects {
        id
        name
      }
    }
  }
`);

/** The signed-in user and the projects they shared with this app, grouped by workspace. */
export async function fetchViewer(railway: RailwayClient) {
  const { me, externalWorkspaces } = await railway(ViewerQuery);
  return { user: me, workspaces: externalWorkspaces };
}

export type Viewer = Awaited<ReturnType<typeof fetchViewer>>;
