import { BaseRoute } from "@utils/base.route";
import { authenticate } from "@middleware/auth.middleware";
import { WorkItemController } from "../controllers/work-item.controller";

/** Mounted at /api/work-items. Add `authenticate` to every route that needs a logged-in user. */
export class WorkItemRouter extends BaseRoute {
  private controller = new WorkItemController();

  constructor() {
    super();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post("/", authenticate, this.handle(this.controller.create));
  }
}
