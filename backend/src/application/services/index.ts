import type { LifeOsRepositories } from '../ports/repositories.js';
import { AuthService } from './auth-service.js';
import { PersonalService } from './personal-service.js';
import { ProfileService } from './profile-service.js';
import { ProjectService } from './project-service.js';
import { StudyService } from './study-service.js';

export function createServices(repository: LifeOsRepositories) {
  return {
    auth: new AuthService(repository),
    profile: new ProfileService(repository),
    projects: new ProjectService(repository),
    study: new StudyService(repository),
    personal: new PersonalService(repository),
  };
}

export type AppServices = ReturnType<typeof createServices>;
