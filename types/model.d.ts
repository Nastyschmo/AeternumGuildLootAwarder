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
  /** Missing on v1 records; typed as 1 so `a.version === 2` can tell the versions apart (strictNullChecks is off). */
  version?: 1;
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
/** An application plus its Firebase key, as returned by sortedApplications(). */
type ApplicationWithId = (ApplicationV1 & { id: PushId }) | (ApplicationV2 & { id: PushId });

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

/** A tile in the Home news row (NEWS_ITEMS, placeholders, Wowhead/announcement cards). */
interface NewsItem {
  title: string;
  blurb: string;
  image?: string | null;
  linkPage?: string;
  linkUrl?: string;
  badge?: string;
  requiresLogin?: boolean;
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

// ---------------------------------------------------------------------
// data/forever/class-stats.json (generated, see scripts/forever-data/).
interface ForeverClassLevelStats {
  hp: number;
  mana: number;
  str: number; agi: number; sta: number; int: number; spi: number;
  /** Crit % gained per point of agility / intellect at this level. */
  critPerAgi: number | null;
  critPerInt: number | null;
}
interface ForeverClassStats {
  build: string;
  /** ChrClasses id -> name + stats for levels 1..60 (index 0 = level 1). */
  classes: Record<string, { name: string; levels: ForeverClassLevelStats[] }>;
  /** ChrRaces id -> attribute offset added to the class row (pre-racial). */
  raceOffsets: Record<string, { name: string; str: number; agi: number; sta: number; int: number; spi: number; faction?: Faction }>;
  /** ChrRaces id -> playable ChrClasses ids (from CharBaseInfo; may be absent). */
  combos?: Record<string, number[]>;
  /** Rating needed for 1% (defense: 1 skill point) at level 60. */
  ratingPerPercentAt60: Record<'hit' | 'crit' | 'haste' | 'expertise' | 'dodge' | 'parry' | 'block' | 'defense', number>;
}

// ---------------------------------------------------------------------
// data/forever/items.json (generated). Short keys keep the file small.
/** 'A' = Alliance, 'H' = Horde. */
type Faction = 'A' | 'H';
/** NPC name, zone; `f` only on vendors that serve one faction. */
interface ForeverNpcRef { n: string; z?: string; f?: Faction; }
interface ForeverItemSource {
  drops?: ForeverNpcRef[];
  /** More than six dropping NPCs: a world/trash drop, only counted. */
  dropCount?: number;
  objects?: string[];
  containers?: string[];
  /** `f`: quest limited to one faction's races. */
  quests?: { n: string; id: number; l?: number; f?: Faction }[];
  vendors?: ForeverNpcRef[];
}
interface ForeverItem {
  id: number;
  /** Name. */ n: string;
  /** Quality (2 uncommon … 5 legendary). */ q: number;
  /** Item level. */ il: number;
  /** Item class (2 weapon, 4 armor) and subclass. */ c: number; sc: number;
  /** Inventory type (slot kind). */ it: number;
  /** Required level. */ rl?: number;
  /** AllowableClass bitmask (bit = ChrClasses id - 1); absent = all. */ ac?: number;
  /** Bonding (1 BoP, 2 BoE, …). */ b?: number;
  /** Icon file name (wow.zamimg.com). */ ic?: string;
  /** Stats as [statId, value]. */ s?: [number, number][];
  /** Armor. */ ar?: number;
  /** Weapon damage. */ dm?: { min: number; max: number; speed: number; dps: number };
  /** Item set id. */ set?: number;
  src?: ForeverItemSource;
  /** Only obtainable by this faction (race mask or one-faction vendors/quests). */
  fa?: Faction;
}
interface ForeverItemsFile {
  build: string;
  eraBuild: string;
  sets: Record<string, string>;
  items: ForeverItem[];
}

/** A BiS planner build (stored locally for now). */
interface BisBuild {
  classId: ClassId;
  specId: SpecId;
  /** ChrRaces id as string. */
  raceId: string;
  level: number;
  /** Slot key -> chosen item and whether it's already obtained. */
  slots: Record<string, { itemId: number; done?: boolean }>;
}
