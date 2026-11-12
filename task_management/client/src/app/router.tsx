import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "@/app/layout/AppLayout";
import { env } from "@/shared/config/env";
import { ROUTES } from "@/shared/constants/routes";
import BootSplash from "@/shared/ui/BootSplash";

import ProtectedRoute from "./routes/ProtectedRoute";
import PublicOnlyRoute from "./routes/PublicOnlyRoute";

// Pages load on demand, so the first screen arrives quickly.
// Demo mode (npm run dev:mock) loads the original versions of a few redesigned screens.
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const SignupPage = lazy(() => import("@/pages/auth/SignupPage"));
const SelectOrganizationPage = lazy(() => import("@/pages/auth/SelectOrganizationPage"));
const SetupOrganizationPage = lazy(() =>
  env.USE_MOCKS
    ? import("@/pages/auth/SetupOrganizationPageClassic")
    : import("@/pages/auth/SetupOrganizationPage"),
);
const SetupOrganizationDetailsPage = lazy(
  () => import("@/pages/auth/SetupOrganizationDetailsPage"),
);
const DashboardPage = lazy(() => import("@/pages/home/DashboardPage"));
const MyWorkPage = lazy(() => import("@/pages/me/MyWorkPage"));
const InboxPage = lazy(() => import("@/pages/inbox/InboxPage"));
const AssistantPage = lazy(() => import("@/pages/assistant/AssistantPage"));
const ProjectsPage = lazy(() =>
  env.USE_MOCKS
    ? import("@/pages/projects/ProjectsPageClassic")
    : import("@/pages/projects/ProjectsPage"),
);
const ProjectLayout = lazy(() =>
  env.USE_MOCKS
    ? import("@/pages/projects/ProjectLayoutClassic")
    : import("@/pages/projects/ProjectLayout"),
);
const ProjectOverviewPage = lazy(() => import("@/pages/projects/ProjectOverviewPage"));
const ProjectHierarchyPage = lazy(() => import("@/pages/projects/ProjectHierarchyPage"));
const ProjectBoardPage = lazy(() => import("@/pages/projects/ProjectBoardPage"));
const ProjectListPage = lazy(() => import("@/pages/projects/ProjectListPage"));
const ProjectBacklogPage = lazy(() => import("@/pages/projects/ProjectBacklogPage"));
const ProjectSprintsPage = lazy(() => import("@/pages/projects/ProjectSprintsPage"));
const ProjectStatusesPage = lazy(() => import("@/pages/projects/ProjectStatusesPage"));
const WorkItemPage = lazy(() => import("@/pages/items/WorkItemPage"));
const TeamsPage = lazy(() => import("@/pages/org/TeamsPage"));
const PeoplePage = lazy(() => import("@/pages/org/PeoplePage"));
const SettingsPage = lazy(() => import("@/pages/org/SettingsPage"));
const NotFoundPage = lazy(() => import("@/pages/system/NotFoundPage"));

export default function AppRoutes() {
  return (
    <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path={ROUTES.LOGIN} element={<LoginPage />} />
          <Route path={ROUTES.SIGNUP} element={<SignupPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path={ROUTES.SELECT_ORGANIZATION} element={<SelectOrganizationPage />} />
          <Route path={ROUTES.SETUP_ORGANIZATION} element={<SetupOrganizationPage />} />
          <Route
            path={ROUTES.SETUP_ORGANIZATION_DETAILS}
            element={<SetupOrganizationDetailsPage />}
          />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to={ROUTES.ASSISTANT} replace />} />
            <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
            <Route path={ROUTES.MY_WORK} element={<MyWorkPage />} />
            <Route path={ROUTES.INBOX} element={<InboxPage />} />
            <Route path={ROUTES.ASSISTANT} element={<AssistantPage />} />
            <Route path={ROUTES.PROJECTS} element={<ProjectsPage />} />
            <Route path={ROUTES.PROJECT} element={<ProjectLayout />}>
              <Route index element={<ProjectOverviewPage />} />
              <Route path="hierarchy" element={<ProjectHierarchyPage />} />
              <Route path="board" element={<ProjectBoardPage />} />
              <Route path="list" element={<ProjectListPage />} />
              <Route path="backlog" element={<ProjectBacklogPage />} />
              <Route path="sprints" element={<ProjectSprintsPage />} />
              {/* Statuses come from the real API; demo mode has no statuses API */}
              {!env.USE_MOCKS && <Route path="statuses" element={<ProjectStatusesPage />} />}
            </Route>
            <Route path={ROUTES.WORK_ITEM} element={<WorkItemPage />} />
            <Route path={ROUTES.TEAMS} element={<TeamsPage />} />
            <Route path={ROUTES.PEOPLE} element={<PeoplePage />} />
            <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
