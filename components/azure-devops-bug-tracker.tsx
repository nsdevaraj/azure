'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, Bug, User, Loader2 } from 'lucide-react'

type Bug = {
  id: number
  title: string
  assignedTo: string
  priority: number
  state: string
}

type BugCardProps = {
  bug: Bug
  onReassign: (bugId: number, newAssignee: string) => Promise<void>
  teamMembers: string[]
}

const priorityMap = {
  1: { label: 'Low', variant: 'secondary' as const },
  2: { label: 'Medium', variant: 'default' as const },
  3: { label: 'High', variant: 'destructive' as const },
}

const BugCard = ({ bug, onReassign, teamMembers }: BugCardProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [newAssignee, setNewAssignee] = useState(bug.assignedTo)
  const [isReassigning, setIsReassigning] = useState(false)

  const handleReassign = async () => {
    setIsReassigning(true)
    try {
      await onReassign(bug.id, newAssignee)
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to reassign bug:', error)
    } finally {
      setIsReassigning(false)
    }
  }

  const priority = priorityMap[bug.priority as keyof typeof priorityMap] || priorityMap[1]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          {bug.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>{bug.assignedTo}</span>
          </div>
          <Badge variant={priority.variant}>
            {priority.label}
          </Badge>
        </div>
        <div className="mt-2 flex justify-between items-center">
          <Badge variant={bug.state === 'New' ? 'default' : bug.state === 'Active' ? 'secondary' : 'outline'}>
            {bug.state}
          </Badge>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">Reassign</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reassign Bug</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Select value={newAssignee} onValueChange={setNewAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select new assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member} value={member}>{member}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleReassign} disabled={isReassigning}>
                  {isReassigning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reassigning...
                    </>
                  ) : (
                    'Confirm Reassignment'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AzureDevOpsBugTracker() {
  const [bugs, setBugs] = useState<Bug[]>([])
  const [teamMembers, setTeamMembers] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organization, setOrganization] = useState('')
  const [project, setProject] = useState('')
  const [pat, setPat] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)

  useEffect(() => {
    if (isConfigured) {
      fetchBugs()
      fetchTeamMembers()
    }
  }, [isConfigured])

  const fetchBugs = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=6.0`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(`:${pat}`)}`,
        },
        body: JSON.stringify({
          query: "Select [System.Id], [System.Title], [System.AssignedTo], [Microsoft.VSTS.Common.Priority], [System.State] From WorkItems Where [System.WorkItemType] = 'Bug' Order By [System.CreatedDate] Desc"
        }),
      })
      if (!response.ok) throw new Error('Failed to fetch bugs')
      const data = await response.json()
      const bugIds = data.workItems.map((item: { id: number }) => item.id)
      const bugDetails = await fetchBugDetails(bugIds)
      setBugs(bugDetails)
    } catch (err) {
      setError('Failed to fetch bugs. Please check your configuration and try again.')
      console.error('Error fetching bugs:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchBugDetails = async (bugIds: number[]) => {
    const response = await fetch(`https://dev.azure.com/${organization}/${project}/_apis/wit/workitems?ids=${bugIds.join(',')}&fields=System.Id,System.Title,System.AssignedTo,Microsoft.VSTS.Common.Priority,System.State&api-version=6.0`, {
      headers: {
        'Authorization': `Basic ${btoa(`:${pat}`)}`,
      },
    })
    if (!response.ok) throw new Error('Failed to fetch bug details')
    const data = await response.json()
    return data.value.map((bug: any) => ({
      id: bug.id,
      title: bug.fields['System.Title'],
      assignedTo: bug.fields['System.AssignedTo']?.displayName || 'Unassigned',
      priority: bug.fields['Microsoft.VSTS.Common.Priority'],
      state: bug.fields['System.State'],
    }))
  }

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/azure-devops/team-members');
      const data = await response.json();
      
      if (!response.ok || data.error) {
        const errorMessage = data.details || data.error || 'Unknown error occurred';
        console.error('Team members fetch error:', errorMessage);
        setError(`Failed to fetch team members: ${errorMessage}`);
        return;
      }
      
      setTeamMembers(data.map((member: { displayName: string }) => member.displayName));
      setError(null);
    } catch (error) {
      console.error('Error fetching team members:', error);
      setError('Failed to fetch team members. Please check your network connection and try again.');
    }
  }

  const handleReassign = async (bugId: number, newAssignee: string) => {
    try {
      const response = await fetch(`https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${bugId}?api-version=6.0`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json-patch+json',
          'Authorization': `Basic ${btoa(`:${pat}`)}`,
        },
        body: JSON.stringify([
          {
            op: 'add',
            path: '/fields/System.AssignedTo',
            value: newAssignee
          }
        ]),
      })
      if (!response.ok) throw new Error('Failed to reassign bug')
      await fetchBugs() // Refresh the bug list
    } catch (err) {
      console.error('Error reassigning bug:', err)
      throw err
    }
  }

  const handleConfigure = () => {
    if (organization && project && pat) {
      setIsConfigured(true)
    } else {
      setError('Please fill in all fields')
    }
  }

  if (!isConfigured) {
    return (
      <div className="container mx-auto p-4 max-w-md">
        <h1 className="text-2xl font-bold mb-4">Configure Azure DevOps</h1>
        <div className="space-y-4">
          <div>
            <Label htmlFor="organization">Organization</Label>
            <Input id="organization" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Your Azure DevOps organization" />
          </div>
          <div>
            <Label htmlFor="project">Project</Label>
            <Input id="project" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Your project name" />
          </div>
          <div>
            <Label htmlFor="pat">Personal Access Token</Label>
            <Input id="pat" type="password" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="Your PAT" />
          </div>
          <Button onClick={handleConfigure}>Configure</Button>
          {error && <p className="text-red-500">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <AlertCircle className="h-6 w-6" />
        Azure DevOps Bug Tracker
      </h1>
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-red-500">{error}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bugs.map(bug => (
            <BugCard key={bug.id} bug={bug} onReassign={handleReassign} teamMembers={teamMembers} />
          ))}
        </div>
      )}
    </div>
  )
}