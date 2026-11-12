import { BaseRoute } from "@utils/base.route";
import { authenticate } from "@middleware/auth.middleware";
import { WorkItemStatusController } from "../controllers/work-item-status.controller";

/** Mounted at /api/work-item-statuses. Add `authenticate` to every route that needs a logged-in user. */
export class WorkItemStatusRouter extends BaseRoute {
  private controller = new WorkItemStatusController();

  constructor() {
    super();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get("/:projectId", authenticate, this.handle(this.controller.list));
    this.router.post("/reorder/:projectId", authenticate, this.handle(this.controller.reorder));
    this.router.post("/:projectId", authenticate, this.handle(this.controller.create));
    this.router.patch("/update/:statusId", authenticate, this.handle(this.controller.update));
    this.router.delete("/delete/:statusId", authenticate, this.handle(this.controller.remove));
  }
}
