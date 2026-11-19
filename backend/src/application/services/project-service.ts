import { randomUUID } from 'node:crypto';
import type { Project, ProjectInput, ProjectPatch, Task, TaskInput, TaskPatch } from '../models.js';
import type { ProjectRepository } from '../ports/repositories.js';
import { ApplicationError } from '../errors.js';

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  list(userId: string): Promise<Project[]> {
    return this.repository.listProjects(userId);
  }

  async get(userId: string, projectId: string): Promise<Project> {
    const project = await this.repository.findProject(userId, projectId);
    if (!project) throw new ApplicationError('PROJECT_NOT_FOUND', 'Không tìm thấy dự án.');
    return project;
  }

  create(userId: string, input: ProjectInput): Promise<Project> {
    return this.repository.createProject(userId, input, randomUUID(), new Date().toISOString());
  }

  async update(userId: string, projectId: string, patch: ProjectPatch): Promise<Project> {
    await this.get(userId, projectId);
    if (!Object.keys(patch).length) throw new ApplicationError('EMPTY_UPDATE', 'Cần ít nhất một trường để cập nhật.');
    const updated = await this.repository.updateProject(userId, projectId, patch, new Date().toISOString());
    if (!updated) throw new ApplicationError('PROJECT_NOT_FOUND', 'Không tìm thấy dự án.');
    return updated;
  }

  async delete(userId: string, projectId: string): Promise<void> {
    await this.get(userId, projectId);
    await this.repository.deleteProject(userId, projectId);
  }

  async listTasks(userId: string, projectId: string): Promise<Task[]> {
    await this.get(userId, projectId);
    return this.repository.listTasks(projectId);
  }

  async createTask(userId: string, projectId: string, input: TaskInput): Promise<Task> {
    await this.get(userId, projectId);
    if (input.dependencies.length) {
      const tasks = await this.repository.listTasks(projectId);
      const existingIds = new Set(tasks.map((task) => task.id));
      if (input.dependencies.some((id) => !existingIds.has(id))) {
        throw new ApplicationError('INVALID_TASK_DEPENDENCY', 'Công việc phụ thuộc phải thuộc cùng dự án.');
      }
    }
    return this.repository.createTask(projectId, input, randomUUID(), new Date().toISOString());
  }

  async updateTask(userId: string, projectId: string, taskId: string, patch: TaskPatch): Promise<Task> {
    await this.get(userId, projectId);
    if (!Object.keys(patch).length) throw new ApplicationError('EMPTY_UPDATE', 'Cần ít nhất một trường để cập nhật.');
    if (patch.dependencies !== undefined) {
      const tasks = await this.repository.listTasks(projectId);
      const existingIds = new Set(tasks.filter((task) => task.id !== taskId).map((task) => task.id));
      if (patch.dependencies.some((id) => !existingIds.has(id))) {
        throw new ApplicationError('INVALID_TASK_DEPENDENCY', 'Công việc phụ thuộc phải thuộc cùng dự án.');
      }
      if (this.hasCycle(tasks, taskId, patch.dependencies)) {
        throw new ApplicationError('INVALID_TASK_DEPENDENCY', 'Phụ thuộc tạo thành vòng lặp giữa các công việc.');
      }
    }
    const updated = await this.repository.updateTask(projectId, taskId, patch, new Date().toISOString());
    if (!updated) throw new ApplicationError('TASK_NOT_FOUND', 'Không tìm thấy công việc.');
    return updated;
  }

  async deleteTask(userId: string, projectId: string, taskId: string): Promise<void> {
    await this.get(userId, projectId);
    if (!(await this.repository.deleteTask(projectId, taskId))) {
      throw new ApplicationError('TASK_NOT_FOUND', 'Không tìm thấy công việc.');
    }
    const remaining = await this.repository.listTasks(projectId);
    const now = new Date().toISOString();
    for (const task of remaining) {
      if (task.dependencies.includes(taskId)) {
        await this.repository.updateTask(
          projectId,
          task.id,
          { dependencies: task.dependencies.filter((id) => id !== taskId) },
          now,
        );
      }
    }
  }

  private hasCycle(tasks: Task[], targetTaskId: string, nextDeps: string[]): boolean {
    const depMap = new Map<string, string[]>(
      tasks.map((t) => [t.id, t.id === targetTaskId ? nextDeps : t.dependencies]),
    );
    depMap.set(targetTaskId, nextDeps);
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const dfs = (node: string): boolean => {
      if (inStack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      inStack.add(node);
      for (const neighbor of depMap.get(node) ?? []) {
        if (dfs(neighbor)) return true;
      }
      inStack.delete(node);
      return false;
    };
    return dfs(targetTaskId);
  }
}
