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
  /** Optional, set in "Meine Charaktere" (used by raid sign-ups). */
  classId?: ClassId;
  specId?: SpecId;
  /** Optional, edited on Meine Charaktere, listed on the Berufe page. */
  professions?: CharacterProfession[];
  /** Optional BiS set per spec: specId -> own saved set id (bisSets / bisPublic). */
  bisSets?: Record<string, string>;
}
interface CharacterProfession {
  /** PROFESSIONS id ('blacksmithing' …). */
  id: string;
  skill: number;
  /** Special recipes: crafted item ids, for Enchanting enchant spell ids. */
  recipes?: number[];
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
  /** BiS-Planer: ids of public sets (bisPublic/<id>) the Admins recommend. */
  bisRecommended: Record<PushId, true>;
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
  /** Made with a profession. */
  craft?: ForeverCraft;
  /** Materials only: zones of the gathering nodes (most spawns first). */
  oz?: string[];
  /** Materials only: zones most of the many droppers live in. */
  dz?: string[];
  /** Materials only: skinned (leather, hides, scales). */
  sk?: 1;
  /** Materials only: from disenchanting (essences, shards, dusts). */
  de?: 1;
}
interface ForeverCraft {
  /** Profession (SkillLine id, e.g. 164 Blacksmithing). */
  p: number;
  /** Skill needed: from the recipe item, or an estimate (`e`) for trainer recipes. */
  r: number;
  e?: 1;
  /** Recipe item that teaches it (absent = learned at a trainer). */
  rec?: { id: number; n: string; b?: number; src?: ForeverItemSource };
  /** Materials as [item id, count]; names in ForeverItemsFile.reagents. */
  m?: [number, number][];
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
  /** SkillLine id -> English profession name. */
  professions?: Record<string, string>;
  /** Material item id -> name. */
  reagents?: Record<string, string>;
  /** Material item id -> where to get it (scripts/forever-data/materials.mjs). */
  materials?: Record<string, ForeverItemSource>;
  /** Zone name -> 'd' dungeon / 'r' raid / 'b' battleground (zones items drop in). */
  instances?: Record<string, 'd' | 'r' | 'b'>;
  items: ForeverItem[];
}

// ---------------------------------------------------------------------
// data/forever/talents.js (generated, window.FOREVER_TALENT_TREES).
interface ForeverTalent {
  name: string;
  max: number;
  /** 1-based, like the snapshot. */
  row: number;
  col: number;
  icon: string;
  /** Tooltip per rank. */
  desc: string[];
  /** The client text had tokens the importer can't resolve ("?"). */
  descPartial?: boolean;
  /** Prerequisite talent (same tree) that must be maxed. */
  req?: string;
}
interface ForeverTalentTrees {
  build: string;
  /** Class display name ("Warrior") -> its three trees in display order. */
  classes: Record<string, { trees: { name: string; talents: ForeverTalent[] }[] }>;
}

// data/forever/enchants.json (generated, scripts/forever-data/enchants.mjs).
interface ForeverEnchant {
  /** Enchant spell id. */
  id: number;
  /** Spell or item name ("Enchant Chest - Major Health", "Rugged Armor Kit"). */
  n: string;
  /** Effect text ("+100 Health"). */
  e: string;
  /** Item class it goes on: 2 weapon, 4 armor. */
  ic: number;
  /** Inventory-type bitmask (armor), else subclass bitmask. */
  inv?: number;
  sub?: number;
  /** From a profession (skill, recipe) … */
  craft?: { p: number; r: number; e?: 1; rec?: { id: number; n: string; src?: ForeverItemSource } };
  /** … or an item you use. */
  item?: { id: number; n: string; src?: ForeverItemSource };
  icon?: string;
  /** Flat stats as [item stat id, value], like ForeverItem.s (procs / % effects not included). */
  st?: [number, number][];
}

/** The BiS planner's working copy (localStorage `rude-bis-draft-v1`). */
interface BisBuild {
  classId: ClassId;
  specId: SpecId;
  /** ChrRaces id as string. */
  raceId: string;
  level: number;
  /** Slot key -> chosen item and enchant ("Habe ich" / "verzaubert" live in the owned set, not here). */
  slots: Record<string, { itemId: number; enchantId?: number }>;
  /** Saved set this draft was loaded from / saved to ('' = none). */
  setId?: string;
  /** Talent points per tree (0..2): talent name -> rank. */
  talents?: Record<string, number>[];
}
/** A saved item set: bisSets/<uid>/<id> (private) or bisPublic/<id>. */
interface BisSavedSet {
  name: string;
  classId: ClassId;
  specId: SpecId;
  raceId: string;
  level: number;
  /** Slot key -> item id. */
  slots: Record<string, number>;
  /** Talent points per tree (stored in Firebase as { t0, t1, t2 }). */
  talents: Record<string, number>[];
  /** Slot key -> enchant spell id. */
  enchants: Record<string, number>;
  /** True when it lives under bisPublic (not stored, derived from the path). */
  public: boolean;
  ownerId: DiscordId;
  ownerName: string;
  createdAt: Millis;
  updatedAt: Millis;
}

// data/howtoplay.js (hand-curated, shown by js/how-to-play.js).
interface HowToPlaySpec {
  summary: string;
  playstyle: string;
  /** Rotation / priority, most important first. */
  priority: string[];
  stats: string;
  tips: string[];
}
interface HowToPlayClass {
  intro: string;
  leveling: string;
  races: string;
  /** Profession recommendations (optional). */
  professions?: string;
  /** Keyed by FOREVER_SPECS spec id. */
  specs: Record<string, HowToPlaySpec>;
  sources: { label: string; url: string }[];
}

// Raids page (js/raids.js): raidEvents/<id>, raidSignups/<eventId>/<uid>.
interface RaidEvent {
  title: string;
  instance: string;
  /** Start time, ms since epoch. */
  start: Millis;
  note: string;
  createdBy: DiscordId;
  createdAt: Millis;
  updatedAt: Millis;
  /** Soft-reserves per player, 0 = off. */
  srMax: number;
  /** Reserves can't be changed any more. */
  srLocked: boolean;
}
interface RaidReserve {
  /** Reserved item ids, slot order. */
  items: number[];
  /** Stored form: slot (s1..s3) -> item id. */
  slots: Record<string, number>;
  /** Display name of the member. */
  name: string;
  charName: string;
  classId: ClassId | '';
  updatedAt: Millis;
}
/** lootAwards/<id> (js/loot.js). */
interface LootAward {
  eventId: string;
  itemId: number;
  /** Name at award time (the item data may lack the item). */
  itemName: string;
  /** Discord id of the receiving member. */
  uid: DiscordId;
  charName: string;
  classId: ClassId | '';
  specId: string;
  kind: 'ms' | 'os' | 'other';
  note: string;
  /** Officer who awarded it. */
  by: DiscordId;
  at: Millis;
  /** Boss, from the RCLootCouncil import. */
  boss?: string;
  /** RCLootCouncil row id (the import skips rows already imported). */
  ext?: string;
}
interface RaidSignup {
  status: 'yes' | 'maybe' | 'no';
  /** Display name of the member. */
  name: string;
  charName: string;
  classId: ClassId;
  specId: SpecId;
  note: string;
  updatedAt: Millis;
}
