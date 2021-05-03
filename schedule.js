const config = require('./config.json');
const {
  sendToSlack,
  getSlotsForAge,
  fetch,
  watch,
  reauthorize,
} = require('./utils');

function schedule(slot, overrideCount = false) {
  const session = slot.sessions.find(
    (session) => session.available_capacity >= (overrideCount ? 0 : 2)
  );

  return fetch(config.cowin.schedule, {
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      beneficiaries: [config.beneficiary_reference_id],
      center_id: slot.center_id,
      dose: 1,
      session_id: session.session_id,
      slot: session.slots[0],
    }),
    method: 'POST',
  })
    .then((res) => {
      if (res.status === 401) {
        console.log('Time to reauthorize');

        // Get new auth token
        reauthorize();

        return null;
      }

      return res.json();
    })
    .then((response) => {
      if (!response) {
        return false;
      }

      console.log(response);

      sendToSlack(response);

      return true;
    });
}

function check() {
  return fetch(config.cowin.search)
    .then((res) => res.json())
    .then((response) => {
      return schedule(response.centers[0], true).then(() => {
        const slotsForAge = getSlotsForAge(response);

        if (slotsForAge.length) {
          let slot;

          if (config.covaxin) {
            slot = slotsForAge[0];
          } else {
            slot = slotsForAge.find(
              (slot) => !slot.vaccines.toLowerCase().includes('Covaxin')
            );
          }

          if (!slot) {
            return false;
          }

          return schedule(slot);
        } else {
          return false;
        }
      });
    })
    .catch((error) => {
      console.error(error);

      sendToSlack('Script errored!', error);

      return true;
    });
}

watch(check);
