import { BaseRoute } from "@utils/base.route";
import { bruteForceProtection } from "@middleware/bruteforce.middleware";
import { AuthController } from "../controllers/auth.controller";

export class AuthRouter extends BaseRoute {
  private controller = new AuthController();

  constructor() {
    super();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post("/signup", this.handle(this.controller.signup));
    this.router.post("/login", bruteForceProtection, this.handle(this.controller.login));
    this.router.post("/refresh-token", this.handle(this.controller.refreshToken));
    this.router.post("/logout", this.handle(this.controller.logout));
  }
}
