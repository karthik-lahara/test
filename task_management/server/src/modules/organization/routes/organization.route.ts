import { BaseRoute } from "@utils/base.route";
import { authenticate } from "@middleware/auth.middleware";
import { OrganizationController } from "../controllers/organization.controller";

/** Mounted at /api/organization. Add `authenticate` to every route that needs a logged-in user. */
export class OrganizationRouter extends BaseRoute {
  private controller = new OrganizationController();

  constructor() {
    super();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post("/create", authenticate, this.handle(this.controller.create));
    this.router.get("/list", authenticate, this.handle(this.controller.list));
    this.router.patch("/update/:organizationId", authenticate, this.handle(this.controller.update));
    this.router.delete("/delete/:organizationId", authenticate, this.handle(this.controller.remove));
    this.router.get("/members/:organizationId", authenticate, this.handle(this.controller.listMembers));
  }
}
