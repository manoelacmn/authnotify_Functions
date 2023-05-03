import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as fb from "firebase-admin/firestore";
// inicializando o firebase admin

const firebase = admin.initializeApp();
const db = fb.getFirestore();

const batch = db.batch();

type Usuario = {
  nome: string,
  email: string,
  telefone: string,
  fcmToken: string | undefined,
  uid: string,
}

/**
 * Tipo para facilitar o retorno
 * de qualquer função.
 * Basta usar esse objeto sempre como
 * retorno.
 */
type CustomResponse = {
  status: string | unknown,
  message: string | unknown,
  payload: unknown,
}

/**
 * Essa função pura (sem ser cloud function)
 * verifica se o parametro data contem:
 * nome, email,  telefone e uid (lembrando que
 * a senha não armazenamos no perfil do firestore).
 * @param {any} data - objeto data (any).
 * @return {boolean} - true se tiver dados corretos
 */
function hasAccountData(data: Usuario) {
  if (data.nome != undefined &&
      data.email != undefined &&
      data.telefone != undefined &&
      data.uid != undefined &&
      data.fcmToken != undefined) {
    return true;
  } else {
    return false;
  }
}

export const setUserProfile = functions
  .region("southamerica-east1")
  .runWith({enforceAppCheck: false})
  .https
  .onCall(async (data, context) => {
    // verificando se o token de depuracao foi fornecido.
    /*
    if (context.app == undefined) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Erro ao acessar a function sem token do AppCheck.");
    }*/
    // inicializar um objeto padrao de resposta já com erro.
    // será modificado durante o curso.
    const cResponse: CustomResponse = {
      status: "ERROR",
      message: "Dados não fornecidos",
      payload: undefined,
    };
    // verificar se o objeto usuario foi fornecido
    const usuario = (data as Usuario);
    if (hasAccountData(usuario)) {
      try {
        const doc = await firebase.firestore()
          .collection("users")
          .add(usuario);
        if (doc.id != undefined) {
          cResponse.status = "SUCCESS";
          cResponse.message = "Perfil de usuário inserido";
          cResponse.payload = JSON.stringify({docId: doc.id});
        } else {
          cResponse.status = "ERROR";
          cResponse.message = "Não foi possível inserir o perfil do usuário.";
          cResponse.payload = JSON.stringify({errorDetail: "doc.id"});
        }
      } catch (e) {
        let exMessage;
        if (e instanceof Error) {
          exMessage = e.message;
        }
        functions.logger.error("Erro ao incluir perfil:", usuario.email);
        functions.logger.error("Exception: ", exMessage);
        cResponse.status = "ERROR";
        cResponse.message = "Erro ao incluir usuário - Verificar Logs";
        cResponse.payload = null;
      }
    } else {
      cResponse.status = "ERROR";
      cResponse.message = "Perfil faltando informações";
      cResponse.payload = undefined;
    }
    return JSON.stringify(cResponse);
  });

export const updateUserFcm = functions.
  region("southamerica-east1")
  .https.
  onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const fcmtoken = data.fcmtoken;

    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("uid", "==", uid).get();

    snapshot.forEach(async (doc) => {
      const tempRef = db.collection("users").doc(doc.id);
      batch.update(tempRef, {fcmToken: fcmtoken});
      await batch.commit();
    });
  });

export const sendFcmMessage = functions
  .region("southamerica-east1")
  .runWith({enforceAppCheck: false})
  .https
  .onCall(async (data, context) => {
    const cResponse: CustomResponse = {
      status: "ERROR",
      message: "Dados não fornecidos ou incompletos",
      payload: undefined,
    };
    // enviar uma mensagem para o token que veio.
    if (data.fcmToken != undefined && data.textContent != undefined) {
      try {
        const message = {
          data: {
            text: data.textContent,
          },
          token: data.fcmToken,
        };
        const messageId = await firebase.messaging().send(message);
        cResponse.status = "SUCCESS";
        cResponse.message = "Mensagem enviada";
        cResponse.payload = JSON.stringify({messageId: messageId});
      } catch (e) {
        let exMessage;
        if (e instanceof Error) {
          exMessage = e.message;
        }
        functions.logger.error("Erro ao enviar mensagem");
        functions.logger.error("Exception: ", exMessage);
        cResponse.status = "ERROR";
        cResponse.message = "Erro ao enviar mensagem - Verificar Logs";
        cResponse.payload = null;
      }
    }
    return JSON.stringify(cResponse);
  });


