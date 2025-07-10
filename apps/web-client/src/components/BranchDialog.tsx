

interface BranchInfo {
  repository?: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    description?: string;
    fork: boolean;
    private: boolean;
  };
  git_status?: {
    ref: string;
    ahead?: number;
    behind?: number;
    has_uncommitted_changes?: boolean;
    has_unpushed_changes?: boolean;
  };
  last_used_at?: string;
  created_at?: string;
  display_name?: string;
  state?: string;
}

interface BranchDialogProps {
  isOpen: boolean;
  branchInfo?: BranchInfo;
  onClose: () => void;
}

export function BranchDialog({ isOpen, branchInfo, onClose }: BranchDialogProps) {
  if (!isOpen || !branchInfo) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getBranchName = () => {
    return branchInfo?.git_status?.ref || 'main';
  };

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div className="modal-box w-11/12 max-w-2xl bg-[#1e1e1e] border border-[#333]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header bg-[#2d2d2d] p-4 rounded-t-lg -mx-6 -mt-6 mb-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <i className="codicon codicon-git-branch text-[#007acc] text-lg"></i>
            <h3 className="font-bold text-lg text-white">Branch Information</h3>
          </div>
          <button 
            onClick={onClose} 
            className="btn btn-sm btn-circle btn-ghost text-[#cccccc] hover:bg-[#404040]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4">
          {/* Repository Section */}
          <div className="bg-[#2d2d2d] p-4 rounded-lg border border-[#444]">
            <h4 className="font-medium text-[#cccccc] mb-3 flex items-center gap-2">
              <i className="codicon codicon-repo text-[#007acc]"></i>
              Repository
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#aaaaaa]">Source (Git):</span>
                {branchInfo?.repository?.html_url ? (
                  <a 
                    href={branchInfo.repository.html_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[#007acc] hover:text-[#005a9e] font-mono flex items-center gap-1"
                  >
                    {branchInfo.repository.full_name}
                    <i className="codicon codicon-link-external text-sm"></i>
                  </a>
                ) : (
                  <span className="text-[#cccccc] font-mono">
                    {branchInfo?.repository?.full_name || 'Unknown'}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#aaaaaa]">Branch:</span>
                <span className="text-[#cccccc] font-mono">{getBranchName()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#aaaaaa]">State:</span>
                <span className={`badge badge-outline ${
                  branchInfo?.state === 'Available' ? 'badge-success' : 'badge-info'
                }`}>
                  {branchInfo?.state || 'Unknown'}
                </span>
              </div>
              {branchInfo?.repository?.fork && (
                <div className="flex items-center justify-between">
                  <span className="text-[#aaaaaa]">Type:</span>
                  <span className="badge badge-outline badge-warning">Fork</span>
                </div>
              )}
              {branchInfo?.repository?.private && (
                <div className="flex items-center justify-between">
                  <span className="text-[#aaaaaa]">Visibility:</span>
                  <span className="badge badge-outline badge-error">Private</span>
                </div>
              )}
            </div>
          </div>

          {/* Git Status Section */}
          <div className="bg-[#2d2d2d] p-4 rounded-lg border border-[#444]">
            <h4 className="font-medium text-[#cccccc] mb-3 flex items-center gap-2">
              <i className="codicon codicon-git-commit text-[#007acc]"></i>
              Git Status
            </h4>
            <div className="space-y-2">
              {branchInfo.git_status.ahead !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[#aaaaaa] flex items-center gap-1">
                    <i className="codicon codicon-arrow-up text-[#00ff00]"></i>
                    Commits ahead:
                  </span>
                  <span className="text-[#cccccc] font-mono">{branchInfo.git_status.ahead}</span>
                </div>
              )}
              {branchInfo.git_status.behind !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[#aaaaaa] flex items-center gap-1">
                    <i className="codicon codicon-arrow-down text-[#ff6b6b]"></i>
                    Commits behind:
                  </span>
                  <span className="text-[#cccccc] font-mono">{branchInfo.git_status.behind}</span>
                </div>
              )}
              {branchInfo.git_status.has_uncommitted_changes !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[#aaaaaa]">Uncommitted changes:</span>
                  <span className={`badge badge-outline ${
                    branchInfo.git_status.has_uncommitted_changes ? 'badge-warning' : 'badge-success'
                  }`}>
                    {branchInfo.git_status.has_uncommitted_changes ? 'Yes' : 'No'}
                  </span>
                </div>
              )}
              {branchInfo.git_status.has_unpushed_changes !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[#aaaaaa]">Unpushed changes:</span>
                  <span className={`badge badge-outline ${
                    branchInfo.git_status.has_unpushed_changes ? 'badge-warning' : 'badge-success'
                  }`}>
                    {branchInfo.git_status.has_unpushed_changes ? 'Yes' : 'No'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Timestamps Section */}
          <div className="bg-[#2d2d2d] p-4 rounded-lg border border-[#444]">
            <h4 className="font-medium text-[#cccccc] mb-3 flex items-center gap-2">
              <i className="codicon codicon-clock text-[#007acc]"></i>
              Codespace Timeline
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#aaaaaa]">Created:</span>
                <span className="text-[#cccccc] font-mono">
                  {branchInfo?.created_at ? formatDate(branchInfo.created_at) : 'Unknown'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#aaaaaa]">Last used:</span>
                <span className="text-[#cccccc] font-mono">
                  {branchInfo?.last_used_at ? formatDate(branchInfo.last_used_at) : 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-action bg-[#2d2d2d] p-4 rounded-b-lg -mx-6 -mb-6 mt-4 flex justify-end">
          <button 
            onClick={onClose}
            className="btn btn-primary bg-[#007acc] hover:bg-[#005a9e] border-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}