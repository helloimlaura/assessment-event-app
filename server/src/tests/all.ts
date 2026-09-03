/** Entry point for the test run.
 *  Node 20's built-in runner does not discover .ts files in a directory, so
 *  every suite is imported here. Individual files still run on their own:
 *    npx tsx --test src/tests/registration.test.ts
 */
import './gameTemplates.test'
import './eventCreation.test'
import './calendar.test'
import './icsExport.test'
import './registration.test'
import './capacityContention.test'
