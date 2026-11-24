export type WorkspaceRole = "OWNER" | "MANAGER" | "LEADER" | "ANALYST";
export const canAnalyzeDataset = (role: WorkspaceRole) => role === "OWNER" || role === "LEADER" || role === "ANALYST";
export const canUploadSourceDataset = (role: WorkspaceRole) => role === "OWNER";
export const canManageReports = (role: WorkspaceRole) => role === "OWNER";
export const canCreateOrganization = (isPlatformAdmin: boolean, hasOwnerMembership: boolean) => isPlatformAdmin || hasOwnerMembership;
export const canCancelDatasetJob = (role: WorkspaceRole, requesterId: string, userId: string) => role === "OWNER" || requesterId === userId;
