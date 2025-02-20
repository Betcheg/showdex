import * as React from 'react';
// import useSize from '@react-hook/size';
import { Trans, useTranslation } from 'react-i18next';
import Svg from 'react-inlinesvg';
import cx from 'classnames';
import { BuildInfo } from '@showdex/components/debug';
import { useSandwich } from '@showdex/components/layout';
import { BaseButton, Button, Scrollable } from '@showdex/components/ui';
import {
  useAuthUsername,
  useCalcdexSettings,
  useCalcdexState,
  useColorScheme,
  useGlassyTerrain,
  useHellodexSettings,
  useHellodexState,
  useHonkdexSettings,
} from '@showdex/redux/store';
import { findPlayerTitle } from '@showdex/utils/app';
import { env, getResourceUrl } from '@showdex/utils/core';
import { useRoomNavigation } from '@showdex/utils/hooks';
import { openUserPopup } from '@showdex/utils/host';
import { BattleRecord } from './BattleRecord';
import { FooterButton } from './FooterButton';
import { GradientButton } from './GradientButton';
import { InstanceButton } from './InstanceButton';
import { PatronagePane } from './PatronagePane';
import { SettingsPane } from './SettingsPane';
import { useHellodexSize } from './useHellodexSize';
import styles from './Hellodex.module.scss';

export interface HellodexProps {
  openCalcdexInstance?: (battleId: string) => void;
  openHonkdexInstance?: (instanceId?: string) => void;
  removeHonkdexInstances?: (...instanceIds: string[]) => void;
}

const packageVersion = `v${env('package-version', 'X.X.X')}`;
const versionSuffix = env('package-version-suffix');
const buildDate = env('build-date');
const buildSuffix = env('build-suffix');
const forumUrl = env('hellodex-forum-url');
const repoUrl = env('hellodex-repo-url');
const communityUrl = env('hellodex-community-url');

export const Hellodex = ({
  openCalcdexInstance,
  openHonkdexInstance,
  removeHonkdexInstances,
}: HellodexProps): JSX.Element => {
  const { t } = useTranslation('hellodex');
  const contentRef = React.useRef<HTMLDivElement>(null);

  useHellodexSize(contentRef);

  const authName = useAuthUsername();
  const authTitle = findPlayerTitle(authName, true);

  // globally listen for left/right key presses to mimic native keyboard navigation behaviors
  // (only needs to be loaded once and seems to persist even after closing the Hellodex tab)
  useRoomNavigation();

  const colorScheme = useColorScheme();
  const glassyTerrain = useGlassyTerrain();
  const settings = useHellodexSettings();
  const calcdexSettings = useCalcdexSettings();
  const honkdexSettings = useHonkdexSettings();

  const state = useHellodexState();
  const calcdexState = useCalcdexState();
  const neverOpens = calcdexSettings?.openOnStart === 'never';

  const instances = Object.values(calcdexState).reverse().filter((b) => (
    !!b?.battleId
      && (b.operatingMode === 'battle' || honkdexSettings?.visuallyEnabled)
  ));

  const instancesEmpty = !instances.length;

  // donate button visibility
  const showDonateButton = settings?.showDonateButton;

  // pane visibilities
  const {
    active: patronageVisible,
    requestOpen: openPatronagePane,
    notifyClose: closePatronagePane,
  } = useSandwich();

  const {
    active: settingsVisible,
    requestOpen: openSettingsPane,
    notifyClose: closeSettingsPane,
  } = useSandwich();

  const toggleSettingsPane = settingsVisible ? closeSettingsPane : openSettingsPane;

  return (
    <div
      className={cx(
        'showdex-module',
        styles.container,
        !!colorScheme && styles[colorScheme],
        glassyTerrain && styles.glassy,
      )}
    >
      <BuildInfo
        position="top-right"
      />

      <div
        ref={contentRef}
        className={cx(
          styles.content,
          ['xs', 'sm'].includes(state.containerSize) && styles.verySmol,
        )}
      >
        {
          patronageVisible &&
          <PatronagePane
            onRequestClose={closePatronagePane}
          />
        }

        {
          settingsVisible &&
          <SettingsPane
            onRequestClose={closeSettingsPane}
          />
        }

        <Svg
          className={styles.showdexIcon}
          description="Showdex Icon"
          src={getResourceUrl('showdex.svg')}
        />

        <div className={styles.topContent}>
          <div className={styles.banner}>
            <Trans
              t={t}
              i18nKey="header.title"
              parent="div"
              className={styles.authors}
              shouldUnescape
              components={{
                and: <div className={styles.ampersand} />,
                keith: (
                  <Button
                    className={styles.authorButton}
                    labelClassName={styles.label}
                    label="BOT Keith"
                    hoverScale={1}
                    absoluteHover
                    onPress={() => openUserPopup('sumfuk')}
                  />
                ),
                cameron: (
                  <Button
                    className={styles.authorButton}
                    labelClassName={styles.label}
                    label="analogcam"
                    hoverScale={1}
                    absoluteHover
                    onPress={() => openUserPopup('camdawgboi')}
                  />
                ),
              }}
            />

            <Trans
              t={t}
              i18nKey="header.subtitle"
              parent="div"
              className={styles.presents}
              shouldUnescape
            />

            {/* besides BuildInfo's, this is the only other visually hardcoded "Showdex" not affected by i18n */}
            <div className={styles.extensionName}>
              Showdex
            </div>
            <div className={styles.extensionVersion}>
              {packageVersion}
              <span className={styles.extensionVersionSuffix}>
                {!!versionSuffix && `-${versionSuffix}`}
                {__DEV__ && !!buildDate && `-b${buildDate.slice(-4)}`}
                {!!buildSuffix && `-${buildSuffix}`}
                {__DEV__ && '-dev'}
              </span>
            </div>
          </div>

          <div className={styles.instancesContainer}>
            <div
              className={cx(
                styles.instancesContent,
                !showDonateButton && styles.hiddenDonation,
              )}
            >
              {instancesEmpty ? (
                <div className={styles.empty}>
                  <Svg
                    className={styles.emptyIcon}
                    description={neverOpens ? 'Error Circle Icon' : 'Info Circle Icon'}
                    src={getResourceUrl(neverOpens ? 'error-circle.svg' : 'info-circle.svg')}
                  />

                  <div className={styles.emptyLabel}>
                    <Trans
                      t={t}
                      i18nKey={'instances.empty.' + (
                        (neverOpens && 'openNever')
                          || (calcdexSettings?.openOnStart === 'playing' && 'openPlaying')
                          || (calcdexSettings?.openOnStart === 'spectating' && 'openSpectating')
                          || 'openAlways'
                      )}
                      shouldUnescape
                      components={{
                        settings: (
                          <Button
                            className={styles.spectateButton}
                            labelClassName={styles.spectateButtonLabel}
                            aria-label={t('instances.empty.settingsTooltip')}
                            tooltip={t('instances.empty.settingsTooltip')}
                            hoverScale={1}
                            absoluteHover
                            onPress={openSettingsPane}
                          />
                        ),
                        spectate: (
                          <Button
                            className={cx(
                              styles.spectateButton,
                              typeof app === 'undefined' && styles.disabled,
                            )}
                            labelClassName={styles.spectateButtonLabel}
                            aria-label={t('instances.empty.spectateTooltip')}
                            tooltip={t('instances.empty.spectateTooltip')}
                            hoverScale={1}
                            absoluteHover
                            disabled={typeof app === 'undefined'}
                            onPress={() => app.joinRoom('battles', 'battles')}
                          />
                        ),
                      }}
                    />
                  </div>

                  {
                    honkdexSettings?.visuallyEnabled &&
                    <>
                      <div className={styles.divider}>
                        <div className={styles.dividerLine} />
                        <div className={styles.dividerLabel}>
                          <Trans
                            t={t}
                            i18nKey="instances.honkdex.orSeparator"
                            shouldUnescape
                          />
                        </div>
                        <div className={styles.dividerLine} />
                      </div>

                      <GradientButton
                        className={styles.honkButton}
                        aria-label={t('instances.honkdex.newAria')}
                        hoverScale={1}
                        onPress={() => openHonkdexInstance?.()}
                      >
                        <Trans
                          t={t}
                          i18nKey="instances.honkdex.newLabel.0"
                          shouldUnescape
                        />
                        <i
                          className="fa fa-car"
                          style={{ padding: '0 8px' }}
                        />
                        <Trans
                          t={t}
                          i18nKey="instances.honkdex.newLabel.1"
                          shouldUnescape
                        />
                      </GradientButton>
                    </>
                  }
                </div>
              ) : (
                <Scrollable className={styles.scrollableInstances}>
                  <div className={styles.instances}>
                    {
                      honkdexSettings?.visuallyEnabled &&
                      <GradientButton
                        className={cx(styles.instanceButton, styles.newHonkButton)}
                        display="block"
                        aria-label={t('instances.honkdex.newAria')}
                        hoverScale={1}
                        onPress={() => openHonkdexInstance()}
                      >
                        <i
                          className="fa fa-plus"
                          style={{ fontSize: 10, lineHeight: 11 }}
                        />
                        <i
                          className="fa fa-car"
                          style={{ padding: '0 8px' }}
                        />
                        <Trans
                          t={t}
                          i18nKey="instances.honkdex.newLabel.1"
                          shouldUnescape
                        />
                      </GradientButton>
                    }

                    {instances.map((instance) => (
                      <InstanceButton
                        key={`Hellodex:InstanceButton:${instance.battleId}`}
                        className={styles.instanceButton}
                        instance={instance}
                        authName={authName}
                        onPress={() => (
                          instance.operatingMode === 'standalone'
                            ? openHonkdexInstance
                            : openCalcdexInstance
                        )?.(instance.battleId)}
                        onRequestRemove={() => removeHonkdexInstances?.(instance.battleId)}
                      />
                    ))}

                    {
                      settings?.showBattleRecord &&
                      <div className={styles.battleRecordSpacer} />
                    }
                  </div>
                </Scrollable>
              )}
            </div>

            {
              settings?.showBattleRecord &&
              <BattleRecord
                className={styles.battleRecord}
              />
            }
          </div>

          {
            showDonateButton &&
            <div
              className={cx(
                styles.donations,
                settings?.showBattleRecord && styles.withBattleRecord,
              )}
            >
              <GradientButton
                className={styles.donateButton}
                aria-label={t('donate.aria')}
                onPress={openPatronagePane}
              >
                {authTitle?.title ? (
                  <i
                    className="fa fa-heart"
                    style={{ padding: '0 8px' }}
                  />
                ) : (
                  <Trans
                    t={t}
                    i18nKey="donate.label"
                    shouldUnescape
                  />
                )}
              </GradientButton>

              <div
                className={cx(
                  styles.donateFootnote,
                  !!authTitle?.title && styles.withTitle,
                )}
              >
                <Trans
                  t={t}
                  i18nKey={`donate.footnote.${authTitle?.title ? 'supporter' : 'default'}`}
                  shouldUnescape
                />
              </div>
            </div>
          }
        </div>

        <div className={styles.footer}>
          <div
            className={cx(
              styles.links,
              settingsVisible && styles.settingsVisible,
            )}
          >
            <FooterButton
              className={cx(styles.linkItem, styles.settingsButton)}
              labelClassName={styles.linkButtonLabel}
              iconAsset={settingsVisible ? 'close-circle.svg' : 'cog.svg'}
              iconDescription={settingsVisible ? 'Close Circle Icon' : 'Cog Icon'}
              label={t(`footer.settings.${settingsVisible ? 'closeLabel' : 'openLabel'}`)}
              aria-label={t(`footer.settings.${settingsVisible ? 'closeTooltip' : 'openTooltip'}`)}
              tooltip={t(`footer.settings.${settingsVisible ? 'closeTooltip' : 'openTooltip'}`)}
              onPress={toggleSettingsPane}
            />

            {/*
              (forumUrl || repoUrl || communityUrl).startsWith('https://') &&
              <div
                className={cx(
                  styles.linkItem,
                  styles.linkSeparator,
                )}
              />
            */}

            {
              forumUrl?.startsWith('https://') &&
              <FooterButton
                className={cx(styles.linkItem, styles.linkButton)}
                iconClassName={styles.signpostIcon}
                labelClassName={styles.linkButtonLabel}
                iconAsset="signpost.svg"
                iconDescription="Signpost Icon"
                label={t('footer.smogon.label')}
                aria-label={t('footer.smogon.tooltip')}
                tooltip={t('footer.smogon.tooltip')}
                onPress={() => window.open(forumUrl, '_blank', 'noopener,noreferrer')}
              />
            }

            {
              repoUrl?.startsWith('https://') &&
              <FooterButton
                className={cx(styles.linkItem, styles.linkButton)}
                labelClassName={styles.linkButtonLabel}
                iconAsset="github-face.svg"
                iconDescription="GitHub Octocat Icon"
                label={t('footer.github.label')}
                aria-label={t('footer.github.tooltip')}
                tooltip={t('footer.github.tooltip')}
                onPress={() => window.open(repoUrl, '_blank', 'noopener,noreferrer')}
              />
            }

            {
              communityUrl?.startsWith('https://') &&
              <FooterButton
                className={cx(styles.linkItem, styles.linkButton)}
                labelClassName={styles.linkButtonLabel}
                iconAsset="discord.svg"
                iconDescription="Discord Clyde Icon"
                label={t('footer.discord.label')}
                aria-label={t('footer.discord.tooltip')}
                tooltip={t('footer.discord.tooltip')}
                onPress={() => window.open(communityUrl, '_blank', 'noopener,noreferrer')}
              />
            }

            {/* {
              releasesUrl?.startsWith('https://') &&
              <FooterButton
                className={cx(styles.linkItem, styles.linkButton)}
                iconClassName={styles.sparkleIcon}
                labelClassName={styles.linkButtonLabel}
                iconAsset="sparkle.svg"
                iconDescription="Sparkle Icon"
                label="New"
                aria-label="Latest Release Notes on GitHub"
                tooltip={`See What's New in ${packageVersion}`}
                onPress={() => window.open(releasesUrl, '_blank', 'noopener,noreferrer')}
              />
            } */}

            {/* {
              bugsUrl?.startsWith('https://') &&
              <FooterButton
                className={cx(styles.linkItem, styles.linkButton)}
                iconClassName={styles.bugIcon}
                labelClassName={styles.linkButtonLabel}
                iconAsset="bug.svg"
                iconDescription="Ladybug Icon"
                label="Bugs"
                aria-label="Known Issues/Bugs on GitHub"
                tooltip="See Known Issues"
                onPress={() => window.open(bugsUrl, '_blank', 'noopener,noreferrer')}
              />
            } */}

            {/* {
              featuresUrl?.startsWith('https://') &&
              <FooterButton
                className={cx(styles.linkItem, styles.linkButton)}
                iconClassName={styles.clipboardIcon}
                labelClassName={styles.linkButtonLabel}
                iconAsset="clipboard-heart.svg"
                iconDescription="Clipboard Heart Icon"
                label="Todo"
                aria-label="Planned and Upcoming Features on GitHub"
                tooltip="See Upcoming Features"
                onPress={() => window.open(featuresUrl, '_blank', 'noopener,noreferrer')}
              />
            } */}
          </div>

          <BaseButton
            className={cx(styles.tizeButton, styles.hideWhenSmol)}
            aria-label="Tize.io"
            onPress={() => window.open('https://tize.io', '_blank')}
          >
            <Svg
              className={styles.tizeLogo}
              description="Tize.io Logo"
              src={getResourceUrl('tize.svg')}
            />
          </BaseButton>

          <div className={cx(styles.credits, styles.hideWhenSmol)}>
            <Trans
              t={t}
              i18nKey="footer.created"
              shouldUnescape
              components={{ love: <i className="fa fa-heart" /> }}
            />
            <br />
            BOT Keith &amp; analogcam
          </div>
        </div>
      </div>
    </div>
  );
};
