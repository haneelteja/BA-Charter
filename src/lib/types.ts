export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export type UserStoryStatus = "draft" | "ready" | "in_progress" | "done";

export interface UserStory {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  status: UserStoryStatus;
  created_at: string;
}
