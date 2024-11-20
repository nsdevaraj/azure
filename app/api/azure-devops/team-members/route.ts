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
    // First, get the project's teams
    const teamsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/teams?api-version=7.1-preview.3`;
    console.log('Fetching teams from URL:', teamsUrl);

    const teamsResponse = await fetch(
      teamsUrl,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${AZURE_DEVOPS_PAT}`).toString('base64')}`,
          'Accept': 'application/json'
        },
      }
    );

    if (!teamsResponse.ok) {
      const errorText = await teamsResponse.text();
      console.error('Azure DevOps API Error (Teams):', {
        status: teamsResponse.status,
        statusText: teamsResponse.statusText,
        body: errorText
      });
      
      // If we get a 404, try getting project info first
      if (teamsResponse.status === 404) {
        const projectUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/_apis/projects/${AZURE_DEVOPS_PROJECT}?api-version=7.1-preview.4`;
        console.log('Fetching project info from URL:', projectUrl);
        
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
          const projectErrorText = await projectResponse.text();
          throw new Error(`Project not found: ${projectResponse.status} ${projectResponse.statusText} - ${projectErrorText}`);
        }

        const projectData = await projectResponse.json();
        throw new Error(`Project "${projectData.name}" found but teams endpoint failed: ${teamsResponse.status} ${teamsResponse.statusText}`);
      }

      throw new Error(`Teams request failed: ${teamsResponse.status} ${teamsResponse.statusText} - ${errorText}`);
    }

    const teamsData = await teamsResponse.json();
    
    // Get the project's default team
    const defaultTeam = teamsData.value[0]; // Usually the first team is the default team
    
    if (!defaultTeam) {
      throw new Error('No teams found in the project');
    }

    // Now get the team members
    const membersUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/_apis/projects/${AZURE_DEVOPS_PROJECT}/teams/${defaultTeam.id}/members?api-version=7.1-preview.3`;
    console.log('Fetching team members from URL:', membersUrl);

    const teamMembersResponse = await fetch(
      membersUrl,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${AZURE_DEVOPS_PAT}`).toString('base64')}`,
          'Accept': 'application/json'
        },
      }
    );

    if (!teamMembersResponse.ok) {
      const errorText = await teamMembersResponse.text();
      console.error('Azure DevOps API Error (Team Members):', {
        status: teamMembersResponse.status,
        statusText: teamMembersResponse.statusText,
        body: errorText
      });
      throw new Error(`Team members request failed: ${teamMembersResponse.status} ${teamMembersResponse.statusText} - ${errorText}`);
    }

    const teamMembersData = await teamMembersResponse.json();
    const teamMembers = teamMembersData.value.map((member: any) => ({
      id: member.identity.id,
      displayName: member.identity.displayName,
      uniqueName: member.identity.uniqueName,
    }));

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
