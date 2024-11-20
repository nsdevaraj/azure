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
  const [organization, setOrganization] = useState('lumel')
  const [project, setProject] = useState('inforiver')
  const [pat, setPat] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [page, setPage] = useState(0)
  const [totalBugs, setTotalBugs] = useState(0)
  const pageSize = 50

  useEffect(() => {
    if (isConfigured) {
      fetchBugs()
      fetchTeamMembers()
    }
  }, [isConfigured, page])

  const fetchBugs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const skip = page * pageSize;
      const response = await fetch(`/api/azure-devops/bugs?skip=${skip}&take=${pageSize}`);
      const data = await response.json();
      
      if (!response.ok || data.error) {
        const errorMessage = data.details || data.error || 'Unknown error occurred';
        console.error('Bug fetch error:', errorMessage);
        setError(`Failed to fetch bugs: ${errorMessage}`);
        return;
      }
      
      setBugs(data.items);
      setTotalBugs(data.total);
      setError(null);
    } catch (error) {
      console.error('Error fetching bugs:', error);
      setError('Failed to fetch bugs. Please check your network connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextPage = () => {
    if ((page + 1) * pageSize < totalBugs) {
      setPage(page + 1);
    }
  };

  const handlePreviousPage = () => {
    if (page > 0) {
      setPage(page - 1);
    }
  };

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
      const response = await fetch(`/api/azure-devops/bugs/${bugId}/reassign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newAssignee }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reassign bug');
      }

      // Refresh bugs after reassignment
      await fetchBugs();
    } catch (error) {
      console.error('Error reassigning bug:', error);
      setError('Failed to reassign bug. Please try again.');
    }
  };

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
      {error && (
        <div className="flex items-center gap-2 text-red-500 mb-4">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {bugs.map((bug) => (
              <BugCard
                key={bug.id}
                bug={bug}
                onReassign={handleReassign}
                teamMembers={teamMembers}
              />
            ))}
          </div>
          
          {/* Pagination controls */}
          <div className="flex justify-between items-center mt-4">
            <Button
              variant="outline"
              onClick={handlePreviousPage}
              disabled={page === 0}
            >
              Previous
            </Button>
            <span>
              Page {page + 1} of {Math.ceil(totalBugs / pageSize)}
            </span>
            <Button
              variant="outline"
              onClick={handleNextPage}
              disabled={(page + 1) * pageSize >= totalBugs}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  )
}