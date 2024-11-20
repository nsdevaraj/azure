import { NextResponse } from 'next/server';

const AZURE_DEVOPS_PAT = process.env.AZURE_DEVOPS_PAT?.replace(/^"|"$/g, '');
const AZURE_DEVOPS_ORGANIZATION = process.env.AZURE_DEVOPS_ORGANIZATION?.replace(/^"|"$/g, '');
const AZURE_DEVOPS_PROJECT = encodeURIComponent(process.env.AZURE_DEVOPS_PROJECT?.replace(/^"|"$/g, '') || '');

export async function GET() {
  if (!AZURE_DEVOPS_PAT || !AZURE_DEVOPS_ORGANIZATION || !AZURE_DEVOPS_PROJECT) {
    return NextResponse.json(
      { 
        error: 'Azure DevOps configuration is missing',
        details: {
          hasPAT: !!AZURE_DEVOPS_PAT,
          hasOrg: !!AZURE_DEVOPS_ORGANIZATION,
          hasProject: !!AZURE_DEVOPS_PROJECT
        }
      },
      { status: 500 }
    );
  }

  try {
    // First, verify the project exists
    const projectUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/_apis/projects/${AZURE_DEVOPS_PROJECT}?api-version=7.1-preview.4`;
    console.log('Verifying project at URL:', projectUrl);

    const projectResponse = await fetch(
      projectUrl,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${AZURE_DEVOPS_PAT}`).toString('base64')}`,
          'Accept': 'application/json'
        },
      }
    );

    if (!projectResponse.ok) {
      const errorText = await projectResponse.text();
      throw new Error(`Project not found: ${projectResponse.status} ${projectResponse.statusText} - ${errorText}`);
    }

    const projectData = await projectResponse.json();
    console.log('Project found:', projectData.name);

    // Use Graph API to get project members
    const graphUrl = `https://vssps.dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/_apis/graph/users?api-version=7.1-preview.1`;
    console.log('Fetching users from Graph API:', graphUrl);

    const graphResponse = await fetch(
      graphUrl,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${AZURE_DEVOPS_PAT}`).toString('base64')}`,
          'Accept': 'application/json'
        },
      }
    );

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      throw new Error(`Failed to fetch users: ${graphResponse.status} ${graphResponse.statusText} - ${errorText}`);
    }

    const usersData = await graphResponse.json();
    
    // Filter out inactive users and map to required format
    const teamMembers = usersData.value
      .filter((user: any) => user.domain === 'aad' && !user.metaType && user.directoryAlias) // Only include active Azure AD users
      .map((user: any) => ({
        id: user.originId,
        displayName: user.displayName,
        uniqueName: user.mailAddress || user.principalName,
      }));

    if (teamMembers.length === 0) {
      console.warn('No team members found in the organization');
    }

    return NextResponse.json(teamMembers);
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch team members',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
