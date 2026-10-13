import type { LandingTranslator } from '@/lib/i18n/landing';
import { IconChart, IconCheck, IconFamily, IconLock, IconShield, IconWhistle } from './icons';
import { RoleSwitcher } from './role-switcher';
import { CAPTAIN_ROLL, MODERATOR_PERMISSIONS_ON, OWNER_ROWS, OWNER_TOTAL } from './sample-data';

function Ticks({ items }: { items: string[] }) {
  return (
    <ul className="ticks">
      {items.map((item) => (
        <li key={item}>
          <IconCheck />
          {item}
        </li>
      ))}
    </ul>
  );
}

function PanelCopy({ eyebrow, title, ticks }: { eyebrow: string; title: string; ticks: string[] }) {
  return (
    <div className="panel-copy">
      <p className="eyebrow">{eyebrow}</p>
      <h3 className="h3">{title}</h3>
      <Ticks items={ticks} />
    </div>
  );
}

function OwnerPanel({ t }: { t: LandingTranslator }) {
  const kpis = t.raw('roles.owner.kpis') as { label: string; value: string }[];
  const periods = t.raw('roles.owner.periods') as string[];
  return (
    <>
      <PanelCopy
        eyebrow={t('roles.owner.eyebrow')}
        title={t('roles.owner.title')}
        ticks={t.raw('roles.owner.ticks') as string[]}
      />
      <div className="browser" role="img" aria-label={t('a11y.sampleData')}>
        <div className="browser-bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <span dir="ltr">
            {t('why.brand.slug')}
            {t('why.brand.domain')}
          </span>
        </div>
        <div className="browser-body">
          <div className="kpis kpis-3">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="kpi">
                <p className="ui-sub">{kpi.label}</p>
                <p className="ui-big">{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="ui fin">
            <p className="ui-title">{t('roles.owner.tableTitle')}</p>
            <table className="fin-table">
              <thead>
                <tr>
                  <th scope="col">{t('roles.owner.columns.period')}</th>
                  <th scope="col">{t('roles.owner.columns.income')}</th>
                  <th scope="col">{t('roles.owner.columns.expenses')}</th>
                  <th scope="col">{t('roles.owner.columns.net')}</th>
                </tr>
              </thead>
              <tbody>
                {OWNER_ROWS.map((row, index) => (
                  <tr key={periods[index]}>
                    <th scope="row">{periods[index]}</th>
                    <td>{row.income}</td>
                    <td>{row.expenses}</td>
                    <td className="net">{row.net}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t('roles.owner.total')}</th>
                  <td>{OWNER_TOTAL.income}</td>
                  <td>{OWNER_TOTAL.expenses}</td>
                  <td>{OWNER_TOTAL.net}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function ModeratorPanel({ t }: { t: LandingTranslator }) {
  const permissions = t.raw('roles.moderator.permissions') as string[];
  return (
    <>
      <PanelCopy
        eyebrow={t('roles.moderator.eyebrow')}
        title={t('roles.moderator.title')}
        ticks={t.raw('roles.moderator.ticks') as string[]}
      />
      <div className="mini-phone" role="img" aria-label={t('a11y.sampleData')}>
        <div className="ui">
          <div className="ui-row">
            <div className="mod-id">
              <span className="avatar" style={{ width: 40, height: 40, fontSize: '.85rem' }}>
                {t('roles.moderator.initial')}
              </span>
              <div>
                <p className="ui-title">{t('roles.moderator.name')}</p>
                <p className="ui-sub">{t('roles.moderator.role')}</p>
              </div>
            </div>
            <span className="icon-tile">
              <IconShield />
            </span>
          </div>
          <ul className="perms">
            {permissions.map((permission, index) => {
              const on = MODERATOR_PERMISSIONS_ON[index];
              return (
                <li key={permission}>
                  <span>{permission}</span>
                  <span className={on ? 'switch on' : 'switch'}>
                    <span className="sr-only">{on ? t('a11y.on') : t('a11y.off')}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mod-set">
            <IconLock />
            {t('roles.moderator.setByOwner')}
          </p>
        </div>
      </div>
    </>
  );
}

function CaptainPanel({ t }: { t: LandingTranslator }) {
  const players = t.raw('roles.captain.players') as { initial: string; name: string }[];
  return (
    <>
      <PanelCopy
        eyebrow={t('roles.captain.eyebrow')}
        title={t('roles.captain.title')}
        ticks={t.raw('roles.captain.ticks') as string[]}
      />
      <div className="mini-phone" role="img" aria-label={t('a11y.sampleData')}>
        <div className="ui">
          <div className="ui-row">
            <p className="ui-title">{t('roles.captain.session')}</p>
            <span className="icon-tile">
              <IconWhistle />
            </span>
          </div>
          <ul className="roll">
            {players.map((player, index) => (
              <li key={player.name}>
                <span className="avatar" style={{ background: CAPTAIN_ROLL[index].background }}>
                  {player.initial}
                </span>
                {player.name}
                {CAPTAIN_ROLL[index].done ? (
                  <span className="check">
                    <IconCheck />
                  </span>
                ) : (
                  <span className="check off" />
                )}
              </li>
            ))}
          </ul>
          <span className="btn btn-primary" style={{ width: '100%', marginTop: '.75rem' }}>
            {t('roles.captain.button')}
          </span>
        </div>
      </div>
    </>
  );
}

function ParentPanel({ t }: { t: LandingTranslator }) {
  return (
    <>
      <PanelCopy
        eyebrow={t('roles.parent.eyebrow')}
        title={t('roles.parent.title')}
        ticks={t.raw('roles.parent.ticks') as string[]}
      />
      <div className="mini-phone" role="img" aria-label={t('a11y.sampleData')}>
        <div className="ui">
          <p className="ui-title">{t('roles.parent.greeting')}</p>
          <p className="ui-sub">{t('roles.parent.child')}</p>
          <div className="ph-next2">
            <p className="ui-sub">{t('roles.parent.nextLabel')}</p>
            <p className="ui-big">{t('roles.parent.nextWhen')}</p>
            <p className="ui-sub">{t('roles.parent.nextWhere')}</p>
          </div>
          <div className="ui-row" style={{ marginTop: '.75rem' }}>
            <span className="ui-sub">{t('roles.parent.attendanceLabel')}</span>
            <b>{t('roles.parent.attendanceValue')}</b>
          </div>
          <div className="bar" style={{ marginTop: '.4rem' }}>
            <span style={{ width: '92%' }} />
          </div>
          <div className="ui-row" style={{ marginTop: '.9rem' }}>
            <span className="ui-sub">{t('roles.parent.subscriptionLabel')}</span>
            <span className="pill pill-ok">{t('roles.parent.paid')}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export function RolesSection({ t }: { t: LandingTranslator }) {
  return (
    <section id="roles" className="section roles" aria-labelledby="roles-h">
      <div className="container">
        <div className="section-head center reveal">
          <span className="eyebrow">{t('roles.eyebrow')}</span>
          <h2 id="roles-h" className="h2">
            {t('roles.title')}
          </h2>
          <p className="lead">{t('roles.lead')}</p>
        </div>

        <RoleSwitcher
          tablistLabel={t('roles.tablistLabel')}
          sampleNote={t('a11y.sampleData')}
          tabs={[
            { id: 'owner', label: t('roles.tabs.owner'), icon: <IconChart />, panel: <OwnerPanel t={t} /> },
            {
              id: 'moderator',
              label: t('roles.tabs.moderator'),
              icon: <IconShield />,
              panel: <ModeratorPanel t={t} />,
            },
            { id: 'captain', label: t('roles.tabs.captain'), icon: <IconWhistle />, panel: <CaptainPanel t={t} /> },
            { id: 'parent', label: t('roles.tabs.parent'), icon: <IconFamily />, panel: <ParentPanel t={t} /> },
          ]}
        />
      </div>
    </section>
  );
}
