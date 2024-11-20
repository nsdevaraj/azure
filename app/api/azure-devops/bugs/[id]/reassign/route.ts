import { NextResponse } from 'next/server';

const AZURE_DEVOPS_PAT = process.env.AZURE_DEVOPS_PAT?.replace(/^"|"$/g, '');
const AZURE_DEVOPS_ORGANIZATION = process.env.AZURE_DEVOPS_ORGANIZATION?.replace(/^"|"$/g, '');
const AZURE_DEVOPS_PROJECT = encodeURIComponent(process.env.AZURE_DEVOPS_PROJECT?.replace(/^"|"$/g, '') || '');

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!AZURE_DEVOPS_PAT || !AZURE_DEVOPS_ORGANIZATION || !AZURE_DEVOPS_PROJECT) {
    return NextResponse.json(
      { error: 'Azure DevOps configuration is missing' },
      { status: 500 }
    );
  }

  try {
    const { newAssignee } = await request.json();
    const bugId = params.id;

    const response = await fetch(
      `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/wit/workitems/${bugId}?api-version=7.1-preview.3`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json-patch+json',
          'Authorization': `Basic ${Buffer.from(`:${AZURE_DEVOPS_PAT}`).toString('base64')}`,
        },
        body: JSON.stringify([
          {
            op: 'add',
            path: '/fields/System.AssignedTo',
            value: newAssignee,
          },
        ]),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to reassign bug: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reassigning bug:', error);
    return NextResponse.json(
      { 
        error: 'Failed to reassign bug',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
