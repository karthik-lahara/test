import { BaseRoute } from "@utils/base.route";
import { authenticate } from "@middleware/auth.middleware";
import { ProjectController } from "../controllers/project.controller";

/** Mounted at /api/projects. Add `authenticate` to every route that needs a logged-in user. */
export class ProjectRouter extends BaseRoute {
  private controller = new ProjectController();

  constructor() {
    super();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post("/:organizationId", authenticate, this.handle(this.controller.create));
    this.router.get("/list/:organizationId", authenticate, this.handle(this.controller.list));
    this.router.get("/details/:projectId", authenticate, this.handle(this.controller.getOne));
    this.router.patch("/update/:projectId", authenticate, this.handle(this.controller.update));
    this.router.delete("/delete/:projectId", authenticate, this.handle(this.controller.remove));
    this.router.get("/members/:projectId", authenticate, this.handle(this.controller.listMembers));
  }
}
