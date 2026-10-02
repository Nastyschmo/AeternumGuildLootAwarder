// Data model of the guild page — the shapes the normalizers in
// js/state.js (and normalizeForeverEntry in js/core.js) produce, i.e. what
// lives in the global `state`. Written out by hand on purpose: types that
// TypeScript infers from plain JS object literals are "open" and don't
// flag typos like `state.applicatons`. Keep this file in sync when a
// normalizer gains or drops a field.

type ClassId = string; // 'warrior' | 'paladin' | … (see CLASSES in js/core.js)
type SpecId = string;
type DiscordId = string;
type PushId = string; // Firebase push key (or the client's fallback id)
type Millis = number; // Date.now()-style timestamp; 0 = unset

type SiteRole = 'admin' | 'officer' | 'member' | 'community';

interface DiscordRoleEntry {
  role: SiteRole;
  username?: string;
  avatar?: string | null;
  notifyOnApplications?: boolean;
}

interface ForeverPick { classId: ClassId; spec: SpecId; }
interface ForeverEntry {
  username: string;
  picks: ForeverPick[];
  firstPick: ForeverPick | null;
}

interface VotingStatus { closed: boolean; }

interface Announcement {
  text: string; // sanitized HTML
  title: string;
  authorName: string;
  authorId: DiscordId;
  createdAt: Millis;
  editedAt: Millis;
}

interface PollOption { id: string; label: string; }
interface PollVote { username: string; choices: string[]; }
interface Poll {
  title: string;
  options: PollOption[];
  multipleChoice: boolean;
  resultsVisible: boolean;
  anonymous: boolean;
  durationDays: number;
  createdAt: Millis;
  expiresAt: Millis;
  closed: boolean;
  createdByName: string;
  createdById: DiscordId;
  votes: Record<DiscordId, PollVote>;
}

type ApplicationStatus = 'open' | 'claimed' | 'interview' | 'candidate' | 'accepted' | 'rejected';

/** Review fields shared by every application version. */
interface ApplicationStatusFields {
  status: ApplicationStatus;
  claimedBy: DiscordId;
  claimedByName: string;
  interviewAt: string; // 'YYYY-MM-DD' or ''
  lastReminderAt: Millis;
  notifiedAt: Millis; // written only by the Worker
  reminderSentAt: Millis; // written only by the Worker
  notes: string;
}

interface ApplicationPick { classId: ClassId; specs: SpecId[]; }
interface ProfessionLevel { professionId: string; level: number | 'max'; }

/** Old flat-form application (before the chat-bot flow). */
interface ApplicationV1 extends ApplicationStatusFields {
  version?: undefined;
  picks: ApplicationPick[];
  experience: string;
  professions: string[] | string; // string = legacy free text
  nameAge: string;
  logs: string;
  remarks: string;
  applicantName: string;
  applicantId: DiscordId;
  createdAt: Millis;
}

/** Chat-bot application (current form). */
interface ApplicationV2 extends ApplicationStatusFields {
  version: 2;
  firstName: string;
  nickname: string;
  age: number | null;
  picks: ApplicationPick[];
  characters: Record<ClassId, string>;
  charProfessions: Record<ClassId, ProfessionLevel[]>;
  extraProfessions: ProfessionLevel[];
  charLogs: Record<ClassId, string>;
  remarks: string;
  applicantName: string;
  applicantId: DiscordId;
  createdAt: Millis;
}

type Application = ApplicationV1 | ApplicationV2;

type RecruitingNeeds = Record<ClassId, SpecId[]>;

interface ClassDeepDiveUpdate {
  id: string;
  date: string; // 'YYYY-MM-DD' or ''
  title: string;
  text: string; // sanitized HTML
  createdAt: Millis;
}
interface ClassDeepDiveEntry {
  summary: string; // sanitized HTML
  summaryUpdatedAt: Millis;
  updates: ClassDeepDiveUpdate[];
}
interface ClassDiveHistoryEntry { date: string; build: string; text: string; }
interface ClassDiveSource { label: string; url: string; }

interface Character {
  id: string;
  name: string;
  realmSlug: string;
  isMain: boolean;
}
interface CharacterProfile {
  nickname: string;
  characters: Character[];
}

interface SeenState { announcementsSeenAt: Millis; }

interface State {
  discordRoles: Record<DiscordId, DiscordRoleEntry>;
  foreverSurvey: Record<DiscordId, ForeverEntry>;
  votingStatus: Record<string, VotingStatus>;
  announcements: Record<PushId, Announcement>;
  polls: Record<PushId, Poll>;
  applications: Record<PushId, Application>;
  recruitingNeeds: RecruitingNeeds;
  classDeepDives: Record<ClassId | 'general', ClassDeepDiveEntry>;
  classDiveUpdateHistory: Record<PushId, ClassDiveHistoryEntry>;
  classDiveSources: Record<PushId, ClassDiveSource>;
  characterProfiles: Record<DiscordId, CharacterProfile>;
  seenState: Record<DiscordId, SeenState>;
}
