import chai from 'chai';
import chaiHttp from 'chai-http';
import crypto from 'crypto';
import sinon from 'sinon';
import config from '../src/config';
import * as controllerUtils from '../src/controllers/utils';
import knex from '../src/db';
import app from '../src/index';

chai.use(chaiHttp);

describe('Login token', () => {
  let sendEmailStub;

  beforeEach((done) => {
    sendEmailStub = sinon.stub(controllerUtils, 'sendMail').returns(Promise.resolve(true));
    done();
  });

  afterEach((done) => {
    sendEmailStub.restore();
    done();
  });

  it('should be stored after login request', (done) => {
    const userEmail = `membre.nouveau@${config.domain}`;

    // Make a login request to generate a token
    chai.request(app)
      .post('/login')
      .type('form')
      .send({
        emailInput: userEmail,
      })

      // Verify the token has been stored in the database
      .then(() => knex('login_tokens').select().where({ email: userEmail }))
      .then((dbRes) => {
        dbRes.length.should.equal(1);
        dbRes[0].email.should.equal(userEmail);
        dbRes[0].username.should.equal('membre.nouveau');
      })
      .then(done)
      .catch(done);
  });

  it('should be deleted after use', (done) => {
    const userEmail = `membre.actif@${config.domain}`;

    // Make a login request to generate a token
    chai.request(app)
      .post('/login')
      .type('form')
      .send({
        emailInput: userEmail,
      })

      // Extract token from the DB
      .then(() => knex('login_tokens').select().where({ email: userEmail }))
      .then((dbRes) => dbRes[0].token)

      // Use the token making a GET request
      .then((token) => chai.request(app).get(`/users?token=${encodeURIComponent(token)}`))

      // Ensure no tokens for this user remain
      .then(() => knex('login_tokens').select().where({ email: userEmail }))
      .then((dbRes) => {
        dbRes.length.should.equal(0);
      })
      .then(done)
      .catch(done);
  });

  it('should only be usable once', (done) => {
    const userEmail = `membre.actif@${config.domain}`;
    let token = null

    // Make a login request to generate a token
    chai.request(app)
      .post('/login')
      .type('form')
      .send({
        emailInput: userEmail,
      })

      // Extract token from the DB
      .then(() => knex('login_tokens').select().where({ email: userEmail }))
      .then((dbRes) => token = dbRes[0].token)

      // Use the token to make a first GET request
      .then(() => chai.request(app).get(`/users?token=${encodeURIComponent(token)}`).redirects(0))

      // Ensure the response sets the token auth cookie
      .then((res) => {
        res.should.have.cookie('token');
      })

      // Make the same GET request again (second time)
      .then(() => chai.request(app).get(`/users?token=${encodeURIComponent(token)}`).redirects(0))

      // Ensure the response did NOT set an auth cookie
      .then((res) => {
        res.should.not.have.cookie('token');
      })
      .then(done)
      .catch(done);
  });

  it('should not be used if expired', (done) => {
    // Create expired token
    const userEmail = `membre.actif@${config.domain}`;
    const token = crypto.randomBytes(256).toString('base64');
    const expirationDate = new Date();

    knex('login_tokens').insert({
      token,
      username: 'membre.actif',
      email: userEmail,
      expires_at: expirationDate,
    })
    // Try to login using this expired token
    .then(() => chai.request(app).get(`/users?token=${encodeURIComponent(token)}`).redirects(0))
    // Ensure the response did NOT set an auth cookie
    .then((res) => {
      res.should.not.have.cookie('token');
    })
    .then(done)
    .catch(done);
  });
});
