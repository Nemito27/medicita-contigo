import {renderHome,renderAppointments,appointmentAction,appointmentSubmit} from './patient/appointments.js';
import {renderWaitlist,renderNotifications,waitlistAction,waitlistSubmit} from './patient/waitlist.js';
import {renderProfile,renderHelp,renderRooms,accountAction,accountSubmit} from './patient/account.js';

/** Patient pages share the same RPC contract in the live and isolated demo services. */
export function renderPatient(page,ctx){
 const views={home:renderHome,appointments:renderAppointments,waitlist:renderWaitlist,notifications:renderNotifications,profile:renderProfile,help:renderHelp,rooms:renderRooms};
 return (views[page]||renderHome)(ctx);
}
export async function handlePatientAction(ctx,action,id){
 if(!action?.startsWith('patient-'))return false;
 if(action==='patient-close'){ctx.close();return true;}
 for(const handler of [appointmentAction,waitlistAction,accountAction])if(await handler(ctx,action,id))return true;
 return false;
}
export async function handlePatientSubmit(ctx,formId,values,form){
 if(!formId?.startsWith('patient-'))return false;
 for(const handler of [appointmentSubmit,waitlistSubmit,accountSubmit])if(await handler(ctx,formId,values,form))return true;
 return false;
}
