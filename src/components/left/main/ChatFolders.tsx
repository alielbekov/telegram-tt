import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useMemo, useRef,
} from '../../../lib/teact/teact';
import { getActions, getGlobal, withGlobal } from '../../../global';

import { ApiMessageEntityTypes, type ApiChatFolder, type ApiChatlistExportedInvite, type ApiSession } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { FolderEditDispatch } from '../../../hooks/reducers/useFoldersReducer';
import type { LeftColumnContent, SettingsScreens } from '../../../types';
import type { MenuItemContextAction } from '../../ui/ListItem';
import type { TabWithProperties } from '../../ui/TabList';

import { ALL_FOLDER_ID } from '../../../config';
import { selectCanShareFolder, selectTabState } from '../../../global/selectors';
import { selectCurrentLimit } from '../../../global/selectors/limits';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { captureEvents, SwipeDirection } from '../../../util/captureEvents';
import { MEMO_EMPTY_ARRAY } from '../../../util/memo';
import { IS_TOUCH_ENV } from '../../../util/windowEnvironment';
import { renderTextWithEntities } from '../../common/helpers/renderTextWithEntities';
import CustomEmoji from '../../common/CustomEmoji';

import useDerivedState from '../../../hooks/useDerivedState';
import { useFolderManagerForUnreadCounters } from '../../../hooks/useFolderManager';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import useShowTransition from '../../../hooks/useShowTransition';

import StoryRibbon from '../../story/StoryRibbon';
import TabList from '../../ui/TabList';
import Transition from '../../ui/Transition';
import ChatList from './ChatList';

import ChatsLogo from '../../../assets/icons/folder/chats.svg'
import FolderLogo from '../../../assets/icons/folder/folder.svg'

import './ChatFolders.scss';

type OwnProps = {
  onSettingsScreenSelect: (screen: SettingsScreens) => void;
  foldersDispatch: FolderEditDispatch;
  onLeftColumnContentChange: (content: LeftColumnContent) => void;
  shouldHideFolderTabs?: boolean;
  isForumPanelOpen?: boolean;
};

type StateProps = {
  chatFoldersById: Record<number, ApiChatFolder>;
  folderInvitesById: Record<number, ApiChatlistExportedInvite[]>;
  orderedFolderIds?: number[];
  activeChatFolder: number;
  currentUserId?: string;
  shouldSkipHistoryAnimations?: boolean;
  maxFolders: number;
  maxChatLists: number;
  maxFolderInvites: number;
  hasArchivedChats?: boolean;
  hasArchivedStories?: boolean;
  archiveSettings: GlobalState['archiveSettings'];
  isStoryRibbonShown?: boolean;
  sessions?: Record<string, ApiSession>;
};

const SAVED_MESSAGES_HOTKEY = '0';
const FIRST_FOLDER_INDEX = 0;

const ChatFolders: FC<OwnProps & StateProps> = ({
  foldersDispatch,
  onSettingsScreenSelect,
  onLeftColumnContentChange,
  chatFoldersById,
  orderedFolderIds,
  activeChatFolder,
  currentUserId,
  isForumPanelOpen,
  shouldSkipHistoryAnimations,
  maxFolders,
  maxChatLists,
  shouldHideFolderTabs,
  folderInvitesById,
  maxFolderInvites,
  hasArchivedChats,
  hasArchivedStories,
  archiveSettings,
  isStoryRibbonShown,
  sessions,
}) => {
  const {
    loadChatFolders,
    setActiveChatFolder,
    openChat,
    openShareChatFolderModal,
    openDeleteChatFolderModal,
    openEditChatFolder,
    openLimitReachedModal,
  } = getActions();

  // eslint-disable-next-line no-null/no-null
  const transitionRef = useRef<HTMLDivElement>(null);

  const lang = useLang();

  useEffect(() => {
    loadChatFolders();
  }, []);

  const {
    ref,
    shouldRender: shouldRenderStoryRibbon,
    getIsClosing: getIsStoryRibbonClosing,
  } = useShowTransition({
    isOpen: isStoryRibbonShown,
    className: false,
    withShouldRender: true,
  });
  const isStoryRibbonClosing = useDerivedState(getIsStoryRibbonClosing);

  const allChatsFolder: ApiChatFolder = useMemo(() => {
    return {
      id: ALL_FOLDER_ID,
      title: { text: orderedFolderIds?.[0] === ALL_FOLDER_ID ? lang('FilterAllChatsShort') : lang('FilterAllChats') },
      includedChatIds: MEMO_EMPTY_ARRAY,
      excludedChatIds: MEMO_EMPTY_ARRAY,
    } satisfies ApiChatFolder;
  }, [orderedFolderIds, lang]);

  const displayedFolders = useMemo(() => {
    return orderedFolderIds
      ? orderedFolderIds.map((id) => {
        if (id === ALL_FOLDER_ID) {
          return allChatsFolder;
        }

        return chatFoldersById[id] || {};
      }).filter(Boolean)
      : undefined;
  }, [chatFoldersById, allChatsFolder, orderedFolderIds]);

  const allChatsFolderIndex = displayedFolders?.findIndex((folder) => folder.id === ALL_FOLDER_ID);
  const isInAllChatsFolder = allChatsFolderIndex === activeChatFolder;
  const isInFirstFolder = FIRST_FOLDER_INDEX === activeChatFolder;

  const folderCountersById = useFolderManagerForUnreadCounters();
  const folderTabs = useMemo(() => {
    if (!displayedFolders || !displayedFolders.length) {
      return undefined;
    }

    return displayedFolders.map((folder, i) => {
      const { id, title, emoticon } = folder;
      const isBlocked = id !== ALL_FOLDER_ID && i > maxFolders - 1;
      const canShareFolder = selectCanShareFolder(getGlobal(), id);
      const contextActions: MenuItemContextAction[] = [];

      if (canShareFolder) {
        contextActions.push({
          title: lang('FilterShare'),
          icon: 'link',
          handler: () => {
            const chatListCount = Object.values(chatFoldersById).reduce((acc, el) => acc + (el.isChatList ? 1 : 0), 0);
            if (chatListCount >= maxChatLists && !folder.isChatList) {
              openLimitReachedModal({
                limit: 'chatlistJoined',
              });
              return;
            }

            // Greater amount can be after premium downgrade
            if (folderInvitesById[id]?.length >= maxFolderInvites) {
              openLimitReachedModal({
                limit: 'chatlistInvites',
              });
              return;
            }

            openShareChatFolderModal({
              folderId: id,
            });
          },
        });
      }

      if (id !== ALL_FOLDER_ID) {
        contextActions.push({
          title: lang('FilterEdit'),
          icon: 'edit',
          handler: () => {
            openEditChatFolder({ folderId: id });
          },
        });

        contextActions.push({
          title: lang('FilterDelete'),
          icon: 'delete',
          destructive: true,
          handler: () => {
            openDeleteChatFolderModal({ folderId: id });
          },
        });
      }

      const lastEntity = title.entities?.find((entity) => {
        return entity.offset + entity.length === title.text.length;
      });

      const isLastEntityCustomEmoji = lastEntity?.type === ApiMessageEntityTypes.CustomEmoji;

      // Remove the last entity from rendering if it's a custom emoji shown as icon
      const titleEntities = isLastEntityCustomEmoji 
        ? title.entities?.filter(entity => entity !== lastEntity)
        : title.entities;

      // Remove the emoji character from the end of the text if we're showing it as an icon
      const titleText = isLastEntityCustomEmoji
        ? title.text.slice(0, -2) // Emoji characters are 2 bytes
        : title.text;

      const folderEmoticon = id === ALL_FOLDER_ID ? (
        <img src={ChatsLogo} className="folder-emoji" alt="" />
      ) : (
        isLastEntityCustomEmoji
          ? undefined
          : (emoticon ? <span className="folder-emoji">{emoticon}</span> : <img src={FolderLogo} className="folder-emoji" alt="" />)
      );

      return {
        id,
        title: (
          <div className="folder-tab-content">
            <div className="folder-icon-container">
              {isLastEntityCustomEmoji ? (
                <CustomEmoji
                  documentId={lastEntity.documentId}
                  className="folder-emoji custom-emoji"
                  isBig={true}
                  size={32}
                />
              ) : folderEmoticon}
            </div>
            <div className="folder-title">
              {renderTextWithEntities({
                text: titleText,
                entities: titleEntities,
                noCustomEmojiPlayback: folder.noTitleAnimations,
              })}
            </div>
          </div>
        ),
        badgeCount: folderCountersById[id]?.chatsCount,
        isBadgeActive: Boolean(folderCountersById[id]?.notificationsCount),
        isBlocked,
        contextActions: contextActions?.length ? contextActions : undefined,
      } satisfies TabWithProperties;
    });
  }, [
    displayedFolders, maxFolders, folderCountersById, lang, chatFoldersById, maxChatLists, folderInvitesById,
    maxFolderInvites,
  ]);

  const handleSwitchTab = useLastCallback((index: number) => {
    setActiveChatFolder({ activeChatFolder: index }, { forceOnHeavyAnimation: true });
  });

  // Prevent `activeTab` pointing at non-existing folder after update
  useEffect(() => {
    if (!folderTabs?.length) {
      return;
    }

    if (activeChatFolder >= folderTabs.length) {
      setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX });
    }
  }, [activeChatFolder, folderTabs, setActiveChatFolder]);

  useEffect(() => {
    if (!IS_TOUCH_ENV || !folderTabs?.length || isForumPanelOpen) {
      return undefined;
    }

    return captureEvents(transitionRef.current!, {
      selectorToPreventScroll: '.chat-list',
      onSwipe: ((e, direction) => {
        if (direction === SwipeDirection.Left) {
          setActiveChatFolder(
            { activeChatFolder: Math.min(activeChatFolder + 1, folderTabs.length - 1) },
            { forceOnHeavyAnimation: true },
          );
          return true;
        } else if (direction === SwipeDirection.Right) {
          setActiveChatFolder({ activeChatFolder: Math.max(0, activeChatFolder - 1) }, { forceOnHeavyAnimation: true });
          return true;
        }

        return false;
      }),
    });
  }, [activeChatFolder, folderTabs, isForumPanelOpen, setActiveChatFolder]);

  const isNotInFirstFolderRef = useRef();
  isNotInFirstFolderRef.current = !isInFirstFolder;
  useEffect(() => (isNotInFirstFolderRef.current ? captureEscKeyListener(() => {
    if (isNotInFirstFolderRef.current) {
      setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX });
    }
  }) : undefined), [activeChatFolder, setActiveChatFolder]);

  useHistoryBack({
    isActive: !isInFirstFolder,
    onBack: () => setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX }, { forceOnHeavyAnimation: true }),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code.startsWith('Digit') && folderTabs) {
        const [, digit] = e.code.match(/Digit(\d)/) || [];
        if (!digit) return;

        if (digit === SAVED_MESSAGES_HOTKEY) {
          openChat({ id: currentUserId, shouldReplaceHistory: true });
          return;
        }

        const folder = Number(digit) - 1;
        if (folder > folderTabs.length - 1) return;

        setActiveChatFolder({ activeChatFolder: folder }, { forceOnHeavyAnimation: true });
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [currentUserId, folderTabs, openChat, setActiveChatFolder]);

  const {
    ref: placeholderRef,
    shouldRender: shouldRenderPlaceholder,
  } = useShowTransition({
    isOpen: !orderedFolderIds,
    noMountTransition: true,
    withShouldRender: true,
  });

  function renderCurrentTab(isActive: boolean) {
    const activeFolder = Object.values(chatFoldersById)
      .find(({ id }) => id === folderTabs![activeChatFolder].id);
    const isFolder = activeFolder && !isInAllChatsFolder;

    return (
      <ChatList
        folderType={isFolder ? 'folder' : 'all'}
        folderId={isFolder ? activeFolder.id : undefined}
        isActive={isActive}
        isForumPanelOpen={isForumPanelOpen}
        foldersDispatch={foldersDispatch}
        onSettingsScreenSelect={onSettingsScreenSelect}
        onLeftColumnContentChange={onLeftColumnContentChange}
        canDisplayArchive={(hasArchivedChats || hasArchivedStories) && !archiveSettings.isHidden}
        archiveSettings={archiveSettings}
        sessions={sessions}
      />
    );
  }

  const shouldRenderFolders = folderTabs && folderTabs.length > 1;

  return (
    <div
      ref={ref}
      className={buildClassName(
        'ChatFolders',
        'ChatFolders--vertical',
        shouldRenderFolders && shouldHideFolderTabs && 'ChatFolders--tabs-hidden',
        shouldRenderStoryRibbon && 'with-story-ribbon',
      )}
    >
      {shouldRenderStoryRibbon && <StoryRibbon isClosing={isStoryRibbonClosing} />}
      <div className="folders-content-wrapper">
        <div className="folders-content">
          {shouldRenderFolders && (
            <TabList
              contextRootElementSelector="#LeftColumn"
              tabs={folderTabs}
              activeTab={activeChatFolder}
              onSwitchTab={handleSwitchTab}
            />
          )}
          <div className="ChatList-wrapper">
            <Transition
              ref={transitionRef}
              name={shouldSkipHistoryAnimations ? 'none' : lang.isRtl ? 'slideOptimizedRtl' : 'slideOptimized'}
              activeKey={activeChatFolder}
              renderCount={shouldRenderFolders ? folderTabs.length : undefined}
            >
              {renderCurrentTab}
            </Transition>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const {
      chatFolders: {
        byId: chatFoldersById,
        orderedIds: orderedFolderIds,
        invites: folderInvitesById,
      },
      chats: {
        listIds: {
          archived,
        },
      },
      stories: {
        orderedPeerIds: {
          archived: archivedStories,
        },
      },
      activeSessions: {
        byHash: sessions,
      },
      currentUserId,
      archiveSettings,
    } = global;
    const { shouldSkipHistoryAnimations, activeChatFolder } = selectTabState(global);
    const { storyViewer: { isRibbonShown: isStoryRibbonShown } } = selectTabState(global);

    return {
      chatFoldersById,
      folderInvitesById,
      orderedFolderIds,
      activeChatFolder,
      currentUserId,
      shouldSkipHistoryAnimations,
      hasArchivedChats: Boolean(archived?.length),
      hasArchivedStories: Boolean(archivedStories?.length),
      maxFolders: selectCurrentLimit(global, 'dialogFilters'),
      maxFolderInvites: selectCurrentLimit(global, 'chatlistInvites'),
      maxChatLists: selectCurrentLimit(global, 'chatlistJoined'),
      archiveSettings,
      isStoryRibbonShown,
      sessions,
    };
  },
)(ChatFolders));
