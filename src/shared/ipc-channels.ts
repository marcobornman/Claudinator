export const IPC = {
  // Board
  BOARD_LOAD: 'board:load',
  BOARD_SAVE: 'board:save',

  // Dialog
  DIALOG_PICK_FOLDER: 'dialog:pick-folder',

  // Session
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_WRITE: 'session:write',
  SESSION_RESIZE: 'session:resize',
  SESSION_DATA: 'session:data',
  SESSION_EXIT: 'session:exit',
  SESSION_BUFFER: 'session:buffer',
  SESSION_LIST: 'session:list',
  SESSION_CWD: 'session:cwd',
  SESSION_CLAUDE_ID: 'session:claude-id',

  // Git
  GIT_STATUS: 'git:status',
  GIT_DIFF: 'git:diff',

  // Stats
  STATS_TODAY: 'stats:today',

  // Settings
  SETTINGS_LOAD: 'settings:load',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_ADD_RULE: 'settings:add-rule',

  // Theme
  THEME_CHANGE: 'theme:change',
  THEME_IMPORT: 'theme:import',
  THEME_EXPORT: 'theme:export',

  // File
  OPEN_FILE: 'file:open',

  // App / Update
  APP_VERSION: 'app:version',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status'
} as const
