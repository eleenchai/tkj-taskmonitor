import { createClient } from '@supabase/supabase-js'

// ── LAZY DB INITIALIZATION ──────────────────────────────────────────────────
let _db = null

export function getDb() {
  if (!_db) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    try {
      _db = createClient(url, key)
    } catch(e) {
      console.error('Supabase init error:', e)
    }
  }
  return _db
}

export const db = new Proxy({}, {
  get(target, prop) {
    const client = getDb()
    if (!client) throw new Error('Database not initialized')
    return client[prop]
  }
})

// ── MAPPERS ──────────────────────────────────────────────────────────────────
export const fromMember = r => ({id:r.id,name:r.name,role:r.role,email:r.email||'',active:r.active,passwordHash:r.password_hash||''})
export const toMember   = m => ({name:m.name,role:m.role,email:m.email||'',active:m.active,password_hash:m.passwordHash||''})
export const fromProject= r => ({id:r.id,code:r.code,name:r.name,active:r.active})
export const toProject  = p => ({code:p.code,name:p.name,active:p.active})
export const fromTask   = r => ({
  id:r.id,ref:r.ref,projectId:r.project_id,task:r.task,
  preparedDate:r.prepared_date||'',dueDate:r.due_date||'',
  dueTime:r.due_time||'18:00',completedDate:r.completed_date||'',
  status:r.status,priority:r.priority,
  assignorId:r.assignor_id,assigneeId:r.assignee_id,
  cc:r.cc||[],remarks:r.remarks||'',linkedTo:r.linked_to||[],
  attachments:r.attachments||[],isPersonal:r.is_personal||false,
  personalOwnerId:r.personal_owner_id,deleted:r.deleted||false,
  deletedAt:r.deleted_at,deletedBy:r.deleted_by,
  deletedApprovedBy:r.deleted_approved_by,
  createdAt:r.created_at,createdBy:r.created_by,
})
export const toTask = t => ({
  id:t.id,ref:t.ref,project_id:t.projectId||null,task:t.task,
  prepared_date:t.preparedDate||null,due_date:t.dueDate||null,
  due_time:t.dueTime||'18:00',completed_date:t.completedDate||null,
  status:t.status,priority:t.priority,
  assignor_id:t.assignorId||null,assignee_id:t.assigneeId||null,
  cc:t.cc||[],remarks:t.remarks||'',linked_to:t.linkedTo||[],
  attachments:t.attachments||[],is_personal:t.isPersonal||false,
  personal_owner_id:t.personalOwnerId||null,deleted:t.deleted||false,
  deleted_at:t.deletedAt||null,deleted_by:t.deletedBy||null,
  deleted_approved_by:t.deletedApprovedBy||null,
  created_at:t.createdAt,created_by:t.createdBy||null,
})

// ── UPDATE MAPPER — now includes supersede chain + suggestion fields ──
export const fromUpdate = r => ({
  id:r.id,taskId:r.task_id,authorId:r.author_id,
  text:r.text||'',attachments:r.attachments||[],
  timestamp:r.timestamp,type:r.type||'comment',
  // Supersede chain
  supersedesId:r.supersedes_id||null,
  supersededById:r.superseded_by_id||null,
  supersededAt:r.superseded_at||null,
  supersededBy:r.superseded_by||null,
  // Suggestion approval
  suggestionStatus:r.suggestion_status||null,
  approvedBy:r.approved_by||null,
  approvedAt:r.approved_at||null,
})
export const toUpdate = u => ({
  id:u.id,task_id:u.taskId,author_id:u.authorId,
  text:u.text||'',attachments:u.attachments||[],
  timestamp:u.timestamp,type:u.type||'comment',
  // Supersede chain
  supersedes_id:u.supersedesId||null,
  superseded_by_id:u.supersededById||null,
  superseded_at:u.supersededAt||null,
  superseded_by:u.supersededBy||null,
  // Suggestion approval
  suggestion_status:u.suggestionStatus||null,
  approved_by:u.approvedBy||null,
  approved_at:u.approvedAt||null,
})

export const fromMsg    = r => ({id:r.id,taskId:r.task_id,authorId:r.author_id,text:r.text||'',attachments:r.attachments||[],timestamp:r.timestamp,urgent:r.urgent||false,mentions:r.mentions||[]})
export const toMsg      = m => ({id:m.id,task_id:m.taskId,author_id:m.authorId,text:m.text||'',attachments:m.attachments||[],timestamp:m.timestamp,urgent:m.urgent||false,mentions:m.mentions||[]})
export const fromDR     = r => ({id:r.id,taskId:r.task_id,requestedBy:r.requested_by,reason:r.reason||'',timestamp:r.timestamp,status:r.status,reviewedBy:r.reviewed_by,reviewedAt:r.reviewed_at,reviewNote:r.review_note||''})
export const toDR       = d => ({id:d.id,task_id:d.taskId,requested_by:d.requestedBy,reason:d.reason||'',timestamp:d.timestamp,status:d.status,reviewed_by:d.reviewedBy||null,reviewed_at:d.reviewedAt||null,review_note:d.reviewNote||''})
