import { NextResponse } from 'next/server';

const AZURE_DEVOPS_PAT = process.env.AZURE_DEVOPS_PAT?.replace(/^"|"$/g, '');
const AZURE_DEVOPS_ORGANIZATION = process.env.AZURE_DEVOPS_ORGANIZATION?.replace(/^"|"$/g, '');
const AZURE_DEVOPS_PROJECT = encodeURIComponent(process.env.AZURE_DEVOPS_PROJECT?.replace(/^"|"$/g, '') || '');
const MAX_BUGS = 50;
const MAX_DAYS = 90; // Fetch bugs from last 90 days by default

export async function GET(request: Request) {
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
    // Get query parameters
    const url = new URL(request.url);
    const skip = parseInt(url.searchParams.get('skip') || '0');
    const take = Math.min(parseInt(url.searchParams.get('take') || '50'), MAX_BUGS);
    const days = parseInt(url.searchParams.get('days') || MAX_DAYS.toString());

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const formattedStartDate = startDate.toISOString().split('T')[0];

    // Use WIQL to get a specific range of work items
    const wiqlUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/wit/wiql?api-version=7.1-preview.2`;
    
    // Build WIQL query with proper syntax and date filter
    const wiqlQuery = `Select Top 1000 [System.Id] From WorkItems Where [System.WorkItemType] = 'Bug' And [System.State] <> 'Closed' And [System.State] <> 'Removed' And [System.ChangedDate] >= '${formattedStartDate}' Order By [System.ChangedDate] Desc`;

    console.log('Executing WIQL query:', wiqlQuery);

    const wiqlResponse = await fetch(
      wiqlUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`:${AZURE_DEVOPS_PAT}`).toString('base64')}`,
        },
        body: JSON.stringify({ query: wiqlQuery }),
      }
    );

    if (!wiqlResponse.ok) {
      const errorText = await wiqlResponse.text();
      console.error('WIQL Error:', {
        status: wiqlResponse.status,
        statusText: wiqlResponse.statusText,
        body: errorText,
        query: wiqlQuery
      });
      throw new Error(`WIQL query failed: ${wiqlResponse.status} ${wiqlResponse.statusText} - ${errorText}`);
    }

    const wiqlData = await wiqlResponse.json();
    
    if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
      return NextResponse.json({
        items: [],
        total: 0,
        skip,
        take,
        hasMore: false,
        daysIncluded: days
      });
    }

    // Apply pagination after getting all items
    const startIndex = skip;
    const endIndex = skip + take;
    const paginatedIds = wiqlData.workItems
      .slice(startIndex, endIndex + 1) // Get one extra for hasMore check
      .map((item: any) => item.id);

    const hasMore = paginatedIds.length > take;
    const workItemIds = paginatedIds.slice(0, take); // Remove the extra item

    // Get work item details
    const workItemsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/wit/workitems?ids=${workItemIds.join(',')}&fields=System.Id,System.Title,System.AssignedTo,Microsoft.VSTS.Common.Priority,System.State,System.ChangedDate&api-version=7.1-preview.3`;
    
    const workItemsResponse = await fetch(
      workItemsUrl,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${AZURE_DEVOPS_PAT}`).toString('base64')}`,
        },
      }
    );

    if (!workItemsResponse.ok) {
      const errorText = await workItemsResponse.text();
      console.error('Work Items Error:', {
        status: workItemsResponse.status,
        statusText: workItemsResponse.statusText,
        body: errorText
      });
      throw new Error(`Work items query failed: ${workItemsResponse.status} ${workItemsResponse.statusText} - ${errorText}`);
    }

    const workItemsData = await workItemsResponse.json();
    
    const bugs = workItemsData.value.map((item: any) => ({
      id: item.id,
      title: item.fields['System.Title'],
      assignedTo: item.fields['System.AssignedTo']?.displayName || 'Unassigned',
      priority: item.fields['Microsoft.VSTS.Common.Priority'] || 2,
      state: item.fields['System.State'],
      changedDate: item.fields['System.ChangedDate'],
    }));

    return NextResponse.json({
      items: bugs,
      skip,
      take,
      hasMore,
      total: wiqlData.workItems.length,
      daysIncluded: days
    });
  } catch (error) {
    console.error('Error fetching bugs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch bugs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
