export type UserRole = "visitor" | "reporter" | "moderator" | "admin";

export type ContentType = "news" | "article" | "documentary";
export type ContentStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "archived"
  | "rejected";
export type ContentFormat = "text" | "video" | "mixed";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  bio: string | null;
  is_verified: boolean;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name_bn: string;
  name_en: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Tag {
  id: string;
  slug: string;
  name_bn: string;
  name_en: string;
  usage_count: number;
  created_at: string;
}

export interface Attachment {
  type: "pdf" | "mp3" | "mp4" | "youtube" | "vimeo" | "soundcloud";
  url: string;
  title: string;
}

export interface Content {
  id: string;
  slug: string;
  content_type: ContentType;
  content_format: ContentFormat;
  language_primary: "bn" | "en";
  title_bn: string;
  subtitle_bn: string | null;
  excerpt_bn: string | null;
  body_bn: string | null;
  title_en: string | null;
  subtitle_en: string | null;
  excerpt_en: string | null;
  body_en: string | null;
  thumbnail_url: string | null;
  thumbnail_alt: string | null;
  featured_image_url: string | null;
  video_url: string | null;
  video_duration: number | null;
  attachments: Attachment[];
  category_id: string | null;
  tags: string[];
  author_id: string | null;
  status: ContentStatus;
  published_at: string | null;
  scheduled_at: string | null;
  view_count: number;
  read_time: number | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  is_featured: boolean;
  is_breaking: boolean;
  is_commentable: boolean;
  allow_notifications: boolean;
  version: number;
  parent_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Row of `content_revisions` (migration 0001). `changes` is a JSONB payload
 *  shaped by src/lib/content/revisions.ts — see types/workflow.ts. */
export interface ContentRevision {
  id: string;
  content_id: string;
  editor_id: string | null;
  changes: Record<string, unknown>;
  version: number;
  created_at: string;
}

export type {
  RevisionChanges,
  ContentRevisionWithEditor,
  ReporterStats,
} from "./workflow";


export interface ContentWithRelations extends Content {
  category: Category | null;
  author: Pick<
    Profile,
    "id" | "username" | "display_name" | "avatar_url" | "is_verified"
  > | null;
}

export interface Comment {
  id: string;
  content_id: string;
  parent_id: string | null;
  author_id: string | null;
  author_name: string | null;
  author_avatar: string | null;
  body: string;
  status: "approved" | "pending" | "rejected" | "spam";
  likes: number;
  dislikes: number;
  depth: number;
  created_at: string;
  updated_at: string;
}
