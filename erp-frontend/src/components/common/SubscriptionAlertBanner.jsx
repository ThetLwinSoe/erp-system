import { useState, useEffect } from 'react';
import { Alert } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { companiesAPI } from '../../services/api';
import { getDaysRemaining } from '../../utils/subscription';
import { SUBSCRIPTION_ALERT_DAYS } from '../../utils/constants';

const formatDate = (dateStr) => new Date(`${dateStr}T00:00:00`).toLocaleDateString();

const describeCompany = ({ name, daysRemaining, subscriptionEndDate }) =>
  daysRemaining < 0
    ? `${name} (expired ${formatDate(subscriptionEndDate)})`
    : `${name} (${daysRemaining === 0 ? 'ends today' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`})`;

/**
 * Web-only expiry-warning banner. Superadmin sees every company within the
 * alert window; a company user sees their own company's status, read
 * directly from `user.company` (no extra API call). Alert-only - never
 * blocks anything, just informs.
 */
const SubscriptionAlertBanner = () => {
  const { user, isSuperAdmin } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    if (isSuperAdmin()) {
      companiesAPI
        .getSubscriptionAlerts()
        .then((res) => setAlerts(res.data.data))
        .catch(() => setAlerts(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed) return null;

  if (isSuperAdmin()) {
    if (!alerts || alerts.count === 0) return null;

    const anyExpired = alerts.companies.some((c) => c.daysRemaining < 0);

    return (
      <Alert
        variant={anyExpired ? 'danger' : 'warning'}
        dismissible
        onClose={() => setDismissed(true)}
        className="mb-0 rounded-0"
      >
        <strong>{alerts.count}</strong> {alerts.count === 1 ? 'company is' : 'companies are'} nearing or past subscription end:{' '}
        {alerts.companies.map(describeCompany).join(', ')}
      </Alert>
    );
  }

  const subscriptionEndDate = user?.company?.subscriptionEndDate;
  if (!subscriptionEndDate) return null;

  const daysRemaining = getDaysRemaining(subscriptionEndDate);
  if (daysRemaining > SUBSCRIPTION_ALERT_DAYS) return null;

  const expired = daysRemaining < 0;

  return (
    <Alert
      variant={expired ? 'danger' : 'warning'}
      dismissible
      onClose={() => setDismissed(true)}
      className="mb-0 rounded-0"
    >
      {expired ? (
        <>Your subscription expired on <strong>{formatDate(subscriptionEndDate)}</strong>. Please contact support to renew.</>
      ) : (
        <>
          Your subscription {daysRemaining === 0 ? 'ends today' : <>ends in <strong>{daysRemaining} day{daysRemaining === 1 ? '' : 's'}</strong></>} ({formatDate(subscriptionEndDate)}). Please contact support to renew.
        </>
      )}
    </Alert>
  );
};

export default SubscriptionAlertBanner;
